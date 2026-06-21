import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AppConfig } from './config';

export interface UrlShortenerStackProps extends StackProps {
  readonly config: AppConfig;
}

/**
 * Root stack for the serverless URL shortener.
 *
 * Constructs are composed here across the implementation phases:
 *   - DynamoDB table          (Phase 2)
 *   - Lambda handlers + API    (Phases 3-4)
 *   - CloudFront + optional WAF (Phase 5)
 *   - CloudWatch observability  (Phase 6)
 */
export class UrlShortenerStack extends Stack {
  constructor(scope: Construct, id: string, props: UrlShortenerStackProps) {
    super(scope, id, props);
    // props.config drives resource configuration in the construct phases below.
  }
}
