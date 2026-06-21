import { Duration } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface UrlApiProps {
  readonly shorten: IFunction;
  readonly redirect: IFunction;
  readonly stats: IFunction;
  /** Allowed CORS origins for the browser-facing POST /shorten call. */
  readonly corsOrigins?: string[];
}

/**
 * HTTP API (v2) fronting the handlers. Routes:
 *   POST /shorten       → shorten
 *   GET  /stats/{code}  → stats
 *   GET  /{code}        → redirect
 *
 * Static routes (/shorten, /stats/{code}) take precedence over the greedy
 * /{code} route in API Gateway v2, so the redirect catch-all is safe.
 */
export class UrlApi extends Construct {
  public readonly httpApi: HttpApi;

  constructor(scope: Construct, id: string, props: UrlApiProps) {
    super(scope, id);

    this.httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'url-shortener-api',
      description: 'Serverless URL Shortener HTTP API',
      corsPreflight: {
        allowOrigins: props.corsOrigins ?? ['*'],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowHeaders: ['content-type', 'authorization'],
        maxAge: Duration.days(1),
      },
    });

    this.httpApi.addRoutes({
      path: '/shorten',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ShortenIntegration', props.shorten),
    });
    this.httpApi.addRoutes({
      path: '/stats/{code}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('StatsIntegration', props.stats),
    });
    this.httpApi.addRoutes({
      path: '/{code}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('RedirectIntegration', props.redirect),
    });
  }
}
