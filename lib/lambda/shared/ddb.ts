import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { tracer } from './observability';

const baseClient = new DynamoDBClient({});

// Capture the client for X-Ray only when tracing is active (no-op in tests/local).
const client = tracer.isTracingEnabled() ? tracer.captureAWSv3Client(baseClient) : baseClient;

/** Shared DynamoDB Document client (auto-marshalling, strips undefined values). */
export const ddbDoc = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

/** Resolve the table name from the environment, failing fast if misconfigured. */
export function tableName(): string {
  const name = process.env.TABLE_NAME;
  if (!name) {
    throw new Error('TABLE_NAME environment variable is not set');
  }
  return name;
}
