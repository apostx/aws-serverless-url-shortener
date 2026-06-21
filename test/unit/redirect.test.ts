import 'aws-sdk-client-mock-jest';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../../lib/lambda/redirect';
import { fakeContext, httpEvent } from './_helpers';

const ddbMock = mockClient(DynamoDBDocumentClient);

function invoke(code?: string): Promise<APIGatewayProxyStructuredResultV2> {
  return handler(
    httpEvent({ pathParameters: code ? { code } : undefined }),
    fakeContext,
  ) as Promise<APIGatewayProxyStructuredResultV2>;
}

beforeEach(() => {
  ddbMock.reset();
  delete process.env.REDIRECT_STATUS_CODE;
  delete process.env.REDIRECT_CACHE_CONTROL;
});

describe('redirect handler', () => {
  it('redirects with 302 and increments clicks atomically', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { originalUrl: 'https://dest.example.com' } });

    const res = await invoke('abc123');

    expect(res.statusCode).toBe(302);
    expect(res.headers?.location).toBe('https://dest.example.com');
    expect(res.headers?.['cache-control']).toBe('private, no-store');
    expect(res.body).toBe('');
    expect(ddbMock).toHaveReceivedCommandWith(UpdateCommand, {
      TableName: 'url-shortener-test',
      UpdateExpression: 'ADD clicks :one SET lastAccessedAt = :iso',
    });
  });

  it('honours a configured redirect status code', async () => {
    process.env.REDIRECT_STATUS_CODE = '301';
    ddbMock.on(UpdateCommand).resolves({ Attributes: { originalUrl: 'https://dest.example.com' } });

    const res = await invoke('abc123');

    expect(res.statusCode).toBe(301);
  });

  it('returns 400 when the code is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
    expect(ddbMock).not.toHaveReceivedCommand(UpdateCommand);
  });

  it('returns 404 when the code is unknown or expired', async () => {
    ddbMock
      .on(UpdateCommand)
      .rejects(new ConditionalCheckFailedException({ $metadata: {}, message: 'failed' }));

    const res = await invoke('missing');
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when the item has no destination', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: {} });
    const res = await invoke('weird');
    expect(res.statusCode).toBe(404);
  });

  it('propagates unexpected DynamoDB errors', async () => {
    ddbMock.on(UpdateCommand).rejects(new Error('throttled'));
    await expect(invoke('abc')).rejects.toThrow('throttled');
  });
});
