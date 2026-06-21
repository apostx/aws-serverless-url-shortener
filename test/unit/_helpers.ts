import { APIGatewayProxyEventV2, Context } from 'aws-lambda';

export const fakeContext = {
  awsRequestId: 'test-request-id',
  functionName: 'test-fn',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-fn',
  memoryLimitInMB: '256',
  getRemainingTimeInMillis: () => 10_000,
  callbackWaitsForEmptyEventLoop: true,
  logGroupName: '/aws/lambda/test-fn',
  logStreamName: 'test-stream',
  done: () => undefined,
  fail: () => undefined,
  succeed: () => undefined,
} as unknown as Context;

interface EventOverrides {
  body?: string;
  pathParameters?: Record<string, string | undefined>;
  domainName?: string;
}

export function httpEvent(overrides: EventOverrides = {}): APIGatewayProxyEventV2 {
  const { body, pathParameters, domainName = 'api.example.com' } = overrides;
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/',
    rawQueryString: '',
    headers: {},
    pathParameters,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api123',
      domainName,
      domainPrefix: domainName.split('.')[0],
      http: {
        method: 'GET',
        path: '/',
        protocol: 'HTTP/1.1',
        sourceIp: '203.0.113.1',
        userAgent: 'jest',
      },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 1_767_225_600_000,
    },
    body,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
