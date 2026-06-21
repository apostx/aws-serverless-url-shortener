import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { EnvironmentName, resolveConfig } from '../../lib/config';
import { UrlShortenerStack } from '../../lib/url-shortener-stack';

function templateFor(
  context: Record<string, unknown> = {},
  environment: EnvironmentName = 'dev',
): Template {
  const app = new App({ context });
  const config = resolveConfig(app, environment);
  const stack = new UrlShortenerStack(app, config.stackName, {
    env: { account: '123456789012', region: 'us-east-1' },
    config,
  });
  return Template.fromStack(stack);
}

describe('UrlCdn — default (no domain, no WAF)', () => {
  const template = templateFor();

  it('creates exactly one CloudFront distribution', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  });

  it('has no aliases, certificate, WebACL, or DNS records', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: Match.absent(),
        ViewerCertificate: Match.absent(),
        WebACLId: Match.absent(),
      }),
    });
    template.resourceCountIs('AWS::CertificateManager::Certificate', 0);
    template.resourceCountIs('AWS::Route53::RecordSet', 0);
    template.resourceCountIs('AWS::WAFv2::WebACL', 0);
  });
});

describe('UrlWaf — enableWaf=true', () => {
  const template = templateFor({ enableWaf: 'true' });

  it('creates a CLOUDFRONT-scoped WebACL with managed groups and a rate limit', () => {
    template.resourceCountIs('AWS::WAFv2::WebACL', 1);
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Scope: 'CLOUDFRONT',
      DefaultAction: { Allow: {} },
      Rules: Match.arrayWith([
        Match.objectLike({ Name: 'AWSManagedRulesCommonRuleSet' }),
        Match.objectLike({ Name: 'AWSManagedRulesKnownBadInputsRuleSet' }),
        Match.objectLike({ Name: 'RateLimit', Action: { Block: {} } }),
      ]),
    });
  });

  it('attaches the WebACL to the distribution', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ WebACLId: Match.anyValue() }),
    });
  });
});

describe('UrlCdn — custom domain', () => {
  const template = templateFor({ domainName: 'go.example.com', hostedZoneName: 'example.com' });

  it('sets the alias and provisions an ACM certificate', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ Aliases: ['go.example.com'] }),
    });
    template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
  });

  it('creates A and AAAA alias records for the domain', () => {
    template.resourceCountIs('AWS::Route53::RecordSet', 2);
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      Name: 'go.example.com.',
    });
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'AAAA',
      Name: 'go.example.com.',
    });
  });
});
