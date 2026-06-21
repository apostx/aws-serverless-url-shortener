import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/** Build a JSON API Gateway (HTTP API v2) response. */
export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

/** Build a JSON error response of the shape `{ error: string }`. */
export function error(
  statusCode: number,
  message: string,
  headers: Record<string, string> = {},
): APIGatewayProxyStructuredResultV2 {
  return json(statusCode, { error: message }, headers);
}
