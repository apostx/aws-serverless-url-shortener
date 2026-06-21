import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AppConfig } from './config';
import { UrlApi } from './constructs/api';
import { UrlCdn } from './constructs/cdn';
import { UrlDatabase } from './constructs/database';
import { UrlFunctions } from './constructs/functions';
import { UrlObservability } from './constructs/observability';
import { UrlWaf } from './constructs/waf';

export interface UrlShortenerStackProps extends StackProps {
  readonly config: AppConfig;
}

/**
 * Root stack for the serverless URL shortener.
 *
 * Constructs are composed here across the implementation phases:
 *   - DynamoDB table          (Phase 2)  ✓
 *   - Lambda handlers + API    (Phases 3-4)  ✓
 *   - CloudFront + optional WAF (Phase 5)  ✓
 *   - CloudWatch observability  (Phase 6)  ✓
 */
export class UrlShortenerStack extends Stack {
  public readonly database: UrlDatabase;
  public readonly functions: UrlFunctions;
  public readonly api: UrlApi;
  public readonly waf?: UrlWaf;
  public readonly cdn: UrlCdn;
  public readonly observability?: UrlObservability;

  constructor(scope: Construct, id: string, props: UrlShortenerStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.database = new UrlDatabase(this, 'Database', { environment: config.environment });

    this.functions = new UrlFunctions(this, 'Functions', {
      table: this.database.table,
      config,
    });

    this.api = new UrlApi(this, 'Api', {
      shorten: this.functions.shorten,
      redirect: this.functions.redirect,
      stats: this.functions.stats,
    });

    let webAclArn: string | undefined;
    if (config.enableWaf) {
      this.waf = new UrlWaf(this, 'Waf');
      webAclArn = this.waf.webAclArn;
    }

    this.cdn = new UrlCdn(this, 'Cdn', {
      httpApi: this.api.httpApi,
      config,
      webAclArn,
    });

    if (config.enableAlarms) {
      this.observability = new UrlObservability(this, 'Observability', {
        shorten: this.functions.shorten,
        redirect: this.functions.redirect,
        stats: this.functions.stats,
        table: this.database.table,
        httpApi: this.api.httpApi,
        config,
      });
    }

    new CfnOutput(this, 'ApiUrl', {
      value: this.api.httpApi.apiEndpoint,
      description: 'Base URL of the HTTP API (default stage)',
    });
  }
}
