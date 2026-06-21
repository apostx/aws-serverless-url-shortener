import 'aws-sdk-client-mock-jest';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../../lib/lambda/shorten';
import { fakeContext, httpEvent } from './_helpers';

const ddbMock = mockClient(DynamoDBDocumentClient);

const conditionalFailure = (): ConditionalCheckFailedException =>
  new ConditionalCheckFailedException({ $metadata: {}, message: 'The conditional request failed' });

function invoke(body: unknown, domainName?: string): Promise<APIGatewayProxyStructuredResultV2> {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return handler(
    httpEvent({ body: raw, domainName }),
    fakeContext,
  ) as Promise<APIGatewayProxyStructuredResultV2>;
}

beforeEach(() => {
  ddbMock.reset();
  delete process.env.PUBLIC_DOMAIN;
});

describe('shorten handler', () => {
  it('creates a short URL and returns 201', async () => {
    ddbMock.on(PutCommand).resolves({});

    const res = await invoke({ originalUrl: 'https://aws.amazon.com/lambda' });

    expect(res.statusCode).toBe(201);
    const payload = JSON.parse(res.body as string);
    expect(payload.shortCode).toHaveLength(7);
    expect(payload.shortUrl).toBe(`https://api.example.com/${payload.shortCode}`);
    expect(payload.originalUrl).toBe('https://aws.amazon.com/lambda');
    expect(payload.expiresAt).toBeDefined();
    expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
      TableName: 'url-shortener-test',
      ConditionExpression: 'attribute_not_exists(shortCode)',
    });
  });

  it('prefers PUBLIC_DOMAIN over the request host when building the short URL', async () => {
    ddbMock.on(PutCommand).resolves({});
    process.env.PUBLIC_DOMAIN = 'go.example.com';

    const res = await invoke({ originalUrl: 'https://example.com' });

    const payload = JSON.parse(res.body as string);
    expect(payload.shortUrl).toBe(`https://go.example.com/${payload.shortCode}`);
  });

  it('rejects an invalid URL with 400 and does not write', async () => {
    const res = await invoke({ originalUrl: 'http://169.254.169.254/' });

    expect(res.statusCode).toBe(400);
    expect(ddbMock).not.toHaveReceivedCommand(PutCommand);
  });

  it('rejects a malformed JSON body with 400', async () => {
    const res = await invoke('this is not json');
    expect(res.statusCode).toBe(400);
  });

  it('uses a valid custom code', async () => {
    ddbMock.on(PutCommand).resolves({});

    const res = await invoke({ originalUrl: 'https://example.com', customCode: 'My-Link_1' });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body as string).shortCode).toBe('My-Link_1');
  });

  it('rejects an invalid custom code with 400', async () => {
    const res = await invoke({ originalUrl: 'https://example.com', customCode: 'no spaces' });
    expect(res.statusCode).toBe(400);
    expect(ddbMock).not.toHaveReceivedCommand(PutCommand);
  });

  it('returns 409 when a custom code is already taken', async () => {
    ddbMock.on(PutCommand).rejects(conditionalFailure());

    const res = await invoke({ originalUrl: 'https://example.com', customCode: 'taken' });

    expect(res.statusCode).toBe(409);
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });

  it('retries on a generated-code collision then succeeds', async () => {
    ddbMock.on(PutCommand).rejectsOnce(conditionalFailure()).resolves({});

    const res = await invoke({ originalUrl: 'https://example.com' });

    expect(res.statusCode).toBe(201);
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 2);
  });

  it('returns 503 after exhausting generation attempts', async () => {
    ddbMock.on(PutCommand).rejects(conditionalFailure());

    const res = await invoke({ originalUrl: 'https://example.com' });

    expect(res.statusCode).toBe(503);
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 5);
  });

  it('propagates unexpected DynamoDB errors', async () => {
    ddbMock.on(PutCommand).rejects(new Error('boom'));
    await expect(invoke({ originalUrl: 'https://example.com' })).rejects.toThrow('boom');
  });
});
