import { App } from 'aws-cdk-lib';

export type EnvironmentName = 'dev' | 'prod';
export type RedirectStatusCode = 301 | 302 | 307 | 308;

/**
 * Strongly-typed application configuration resolved from CDK context.
 *
 * All "production extras" (custom domain, WAF, alarms) are opt-in so the stack
 * deploys at ~$0 on the CloudFront default domain out of the box. Override per
 * environment with namespaced context, e.g. `-c prod:enableWaf=true`.
 */
export interface AppConfig {
  readonly environment: EnvironmentName;
  readonly stackName: string;
  /** Must be us-east-1: CloudFront WAF (scope CLOUDFRONT) and its ACM cert live there. */
  readonly region: string;
  /** Custom short domain, e.g. "go.example.com". Unset → CloudFront default domain. */
  readonly domainName?: string;
  /** Route 53 hosted zone apex, e.g. "example.com". Required when domainName is set. */
  readonly hostedZoneName?: string;
  /** Attach a WAFv2 WebACL to CloudFront. Incurs a ~$5/mo base charge. */
  readonly enableWaf: boolean;
  /** Create CloudWatch alarms + dashboard + SNS topic. Defaults on for prod. */
  readonly enableAlarms: boolean;
  /** Email address subscribed to the alarm SNS topic. */
  readonly alarmEmail?: string;
  /** Status for GET /{code}. 302 keeps links editable and click counts accurate. */
  readonly redirectStatusCode: RedirectStatusCode;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase());
  return fallback;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Resolve configuration for an environment. Context is read environment-first
 * (`<env>:<key>`) then falls back to the bare key, so shared defaults and
 * per-environment overrides can coexist.
 */
export function resolveConfig(app: App, environment: EnvironmentName): AppConfig {
  const ctx = (key: string): unknown =>
    app.node.tryGetContext(`${environment}:${key}`) ?? app.node.tryGetContext(key);

  const domainName = asString(ctx('domainName'));
  const hostedZoneName = asString(ctx('hostedZoneName'));

  if (domainName && !hostedZoneName) {
    throw new Error(
      `Context "domainName" (${domainName}) requires "hostedZoneName" (the Route 53 hosted zone apex, e.g. example.com).`,
    );
  }

  const requestedRedirect = Number(ctx('redirectStatusCode') ?? 302);
  const redirectStatusCode = (
    [301, 302, 307, 308].includes(requestedRedirect) ? requestedRedirect : 302
  ) as RedirectStatusCode;

  return {
    environment,
    stackName: `UrlShortener-${environment === 'prod' ? 'Prod' : 'Dev'}`,
    region: asString(ctx('region')) ?? 'us-east-1',
    domainName,
    hostedZoneName,
    enableWaf: asBool(ctx('enableWaf'), false),
    enableAlarms: asBool(ctx('enableAlarms'), environment === 'prod'),
    alarmEmail: asString(ctx('alarmEmail')),
    redirectStatusCode,
  };
}
