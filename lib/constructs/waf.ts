import { CfnWebACL } from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

export interface UrlWafProps {
  /** Requests per 5 minutes per source IP before blocking (WAF minimum is 100). */
  readonly rateLimitPerFiveMinutes?: number;
}

/**
 * WAFv2 WebACL for CloudFront (scope CLOUDFRONT — must live in us-east-1).
 *
 * Layers AWS managed protections (OWASP common set + known-bad inputs) with a
 * per-IP rate limit. Created only when `enableWaf` is set, since the WebACL
 * carries a ~$5/mo base charge.
 */
export class UrlWaf extends Construct {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: UrlWafProps = {}) {
    super(scope, id);

    const rateLimit = props.rateLimitPerFiveMinutes ?? 1000;

    const webAcl = new CfnWebACL(this, 'WebAcl', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'UrlShortenerWaf',
        sampledRequestsEnabled: true,
      },
      rules: [
        managedRuleGroup('CommonRuleSet', 1, 'AWSManagedRulesCommonRuleSet'),
        managedRuleGroup('KnownBadInputs', 2, 'AWSManagedRulesKnownBadInputsRuleSet'),
        {
          name: 'RateLimit',
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: { limit: rateLimit, aggregateKeyType: 'IP' },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimit',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    this.webAclArn = webAcl.attrArn;
  }
}

function managedRuleGroup(
  metricName: string,
  priority: number,
  name: string,
): CfnWebACL.RuleProperty {
  return {
    name,
    priority,
    overrideAction: { none: {} },
    statement: { managedRuleGroupStatement: { vendorName: 'AWS', name } },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName,
      sampledRequestsEnabled: true,
    },
  };
}
