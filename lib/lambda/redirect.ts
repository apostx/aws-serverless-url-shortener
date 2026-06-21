import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda';
import { ddbDoc, tableName } from './shared/ddb';
import { error } from './shared/http';
import { logger } from './shared/observability';

const VALID_REDIRECT_CODES = new Set([301, 302, 307, 308]);
const DEFAULT_REDIRECT_CODE = 302;
// 302 + no-store keeps click counts accurate and links editable. Operators can
// trade accuracy for edge caching via REDIRECT_CACHE_CONTROL.
const DEFAULT_CACHE_CONTROL = 'private, no-store';

/**
 * GET /{code} — resolve a short code to its destination and redirect.
 *
 * A single conditional UpdateItem atomically (a) verifies the code exists and is
 * not expired, (b) increments the click counter, (c) stamps last-access time and
 * (d) returns the destination — one round-trip instead of read-then-write.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  logger.addContext(context);

  const shortCode = event.pathParameters?.code;
  if (!shortCode) {
    return error(400, 'Missing short code');
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  let originalUrl: string | undefined;
  try {
    const result = await ddbDoc.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { shortCode },
        UpdateExpression: 'ADD clicks :one SET lastAccessedAt = :iso',
        ConditionExpression:
          'attribute_exists(shortCode) AND (attribute_not_exists(#ttl) OR #ttl > :now)',
        ExpressionAttributeNames: { '#ttl': 'ttl' },
        ExpressionAttributeValues: {
          ':one': 1,
          ':iso': new Date().toISOString(),
          ':now': nowEpoch,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    originalUrl = result.Attributes?.originalUrl as string | undefined;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      logger.info('Short code not found or expired', { shortCode });
      return error(404, 'Short code not found');
    }
    logger.error('Failed to resolve short code', { shortCode, error: err as Error });
    throw err;
  }

  if (!originalUrl) {
    return error(404, 'Short code not found');
  }

  return {
    statusCode: redirectStatusCode(),
    headers: {
      location: originalUrl,
      'cache-control': process.env.REDIRECT_CACHE_CONTROL ?? DEFAULT_CACHE_CONTROL,
    },
    body: '',
  };
};

function redirectStatusCode(): number {
  const configured = Number(process.env.REDIRECT_STATUS_CODE);
  return VALID_REDIRECT_CODES.has(configured) ? configured : DEFAULT_REDIRECT_CODE;
}
