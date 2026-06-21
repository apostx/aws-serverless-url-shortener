import 'aws-sdk-client-mock-jest';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../../lib/lambda/stats';
import { fakeContext, httpEvent } from './_helpers';

const ddbMock = mockClient(DynamoDBDocumentClient);

function invoke(code?: string): Promise<APIGatewayProxyStructuredResultV2> {
  return handler(
    httpEvent({ pathParameters: code ? { code } : undefined }),
    fakeContext,
  ) as Promise<APIGatewayProxyStructuredResultV2>;
}

const future = Math.floor(Date.now() / 1000) + 86_400;
const past = Math.floor(Date.now() / 1000) - 10;

beforeEach(() => ddbMock.reset());

describe('stats handler', () => {
  it('returns analytics for an existing code', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        shortCode: 'abc',
        originalUrl: 'https://example.com',
        clicks: 42,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastAccessedAt: '2026-06-01T00:00:00.000Z',
        ttl: future,
      },
    });

    const res = await invoke('abc');

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body as string);
    expect(payload).toMatchObject({
      shortCode: 'abc',
      originalUrl: 'https://example.com',
      clicks: 42,
    });
    expect(payload.expiresAt).toBe(new Date(future * 1000).toISOString());
  });

  it('returns 400 when the code is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the code is unknown', async () => {
    ddbMock.on(GetCommand).resolves({});
    const res = await invoke('missing');
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when the code has expired', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { shortCode: 'old', ttl: past } });
    const res = await invoke('old');
    expect(res.statusCode).toBe(404);
  });

  it('defaults clicks to 0 when absent', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { shortCode: 'abc', originalUrl: 'https://x.io' } });
    const res = await invoke('abc');
    expect(JSON.parse(res.body as string).clicks).toBe(0);
  });
});
