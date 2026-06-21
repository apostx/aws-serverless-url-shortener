import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AppConfig } from './config';
import { UrlDatabase } from './constructs/database';

export interface UrlShortenerStackProps extends StackProps {
  readonly config: AppConfig;
}

/**
 * Root stack for the serverless URL shortener.
 *
 * Constructs are composed here across the implementation phases:
 *   - DynamoDB table          (Phase 2)  ✓
 *   - Lambda handlers + API    (Phases 3-4)
 *   - CloudFront + optional WAF (Phase 5)
 *   - CloudWatch observability  (Phase 6)
 */
export class UrlShortenerStack extends Stack {
  public readonly database: UrlDatabase;

  constructor(scope: Construct, id: string, props: UrlShortenerStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.database = new UrlDatabase(this, 'Database', { environment: config.environment });
  }
}
