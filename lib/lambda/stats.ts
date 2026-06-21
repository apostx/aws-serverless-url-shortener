import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda';
import { ddbDoc, tableName } from './shared/ddb';
import { error, json } from './shared/http';
import { logger } from './shared/observability';

/** GET /stats/{code} — return click analytics for a short code as JSON. */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  logger.addContext(context);

  const shortCode = event.pathParameters?.code;
  if (!shortCode) {
    return error(400, 'Missing short code');
  }

  const { Item } = await ddbDoc.send(
    new GetCommand({ TableName: tableName(), Key: { shortCode } }),
  );

  const nowEpoch = Math.floor(Date.now() / 1000);
  const expired = typeof Item?.ttl === 'number' && Item.ttl <= nowEpoch;
  if (!Item || expired) {
    return error(404, 'Short code not found');
  }

  return json(200, {
    shortCode: Item.shortCode,
    originalUrl: Item.originalUrl,
    clicks: Item.clicks ?? 0,
    createdAt: Item.createdAt ?? null,
    lastAccessedAt: Item.lastAccessedAt ?? null,
    expiresAt: typeof Item.ttl === 'number' ? new Date(Item.ttl * 1000).toISOString() : null,
  });
};
