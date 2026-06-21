import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda';
import { ddbDoc, tableName } from './shared/ddb';
import { error, json } from './shared/http';
import { generateCode, isValidCustomCode } from './shared/code';
import { logger } from './shared/observability';
import { validateUrl } from './shared/validate-url';

const SECONDS_PER_DAY = 86_400;
const DEFAULT_EXPIRY_DAYS = 365;
const MAX_EXPIRY_DAYS = 3_650; // 10 years
const MAX_GENERATION_ATTEMPTS = 5;

interface ShortenRequest {
  originalUrl?: unknown;
  customCode?: unknown;
  expiresInDays?: unknown;
  userId?: unknown;
}

/** POST /shorten — validate a URL, claim a code, and persist the mapping. */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  logger.addContext(context);

  let payload: ShortenRequest;
  try {
    payload = JSON.parse(event.body ?? '{}') as ShortenRequest;
  } catch {
    return error(400, 'Request body must be valid JSON');
  }

  const validation = validateUrl(payload.originalUrl);
  if (!validation.valid) {
    return error(400, validation.reason ?? 'Invalid URL');
  }
  const originalUrl = payload.originalUrl as string;

  let customCode: string | undefined;
  if (payload.customCode !== undefined) {
    if (typeof payload.customCode !== 'string' || !isValidCustomCode(payload.customCode)) {
      return error(
        400,
        'customCode must be 3-32 characters of [A-Za-z0-9_-] and must not be a reserved word',
      );
    }
    customCode = payload.customCode;
  }

  const expiresInDays = normalizeExpiry(payload.expiresInDays);
  const ttl = Math.floor(Date.now() / 1000) + expiresInDays * SECONDS_PER_DAY;
  const createdAt = new Date().toISOString();
  const userId =
    typeof payload.userId === 'string' && payload.userId.length > 0 ? payload.userId : undefined;

  const attempts = customCode ? 1 : MAX_GENERATION_ATTEMPTS;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const shortCode = customCode ?? generateCode();
    try {
      await ddbDoc.send(
        new PutCommand({
          TableName: tableName(),
          Item: { shortCode, originalUrl, createdAt, ttl, clicks: 0, userId },
          ConditionExpression: 'attribute_not_exists(shortCode)',
        }),
      );

      logger.info('Short URL created', { shortCode });
      return json(201, {
        shortCode,
        shortUrl: buildShortUrl(event, shortCode),
        originalUrl,
        expiresAt: new Date(ttl * 1000).toISOString(),
      });
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        if (customCode) {
          return error(409, `Short code "${customCode}" is already taken`);
        }
        // Generated-code collision — try another code.
        continue;
      }
      logger.error('Failed to persist short URL', { error: err as Error });
      throw err;
    }
  }

  logger.error('Exhausted unique short code generation attempts');
  return error(503, 'Could not generate a unique short code, please retry');
};

function normalizeExpiry(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_EXPIRY_DAYS;
  }
  return Math.min(Math.floor(n), MAX_EXPIRY_DAYS);
}

function buildShortUrl(event: APIGatewayProxyEventV2, code: string): string {
  const domain = process.env.PUBLIC_DOMAIN ?? event.requestContext?.domainName;
  return domain ? `https://${domain}/${code}` : `/${code}`;
}
