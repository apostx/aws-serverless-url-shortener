import { CfnOutput, Stack } from 'aws-cdk-lib';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  AaaaRecord,
  ARecord,
  HostedZone,
  IHostedZone,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { AppConfig } from '../config';

export interface UrlCdnProps {
  readonly httpApi: HttpApi;
  readonly config: AppConfig;
  /** WAFv2 WebACL ARN to attach (when WAF is enabled). */
  readonly webAclArn?: string;
}

/**
 * CloudFront distribution fronting the HTTP API: edge TLS termination, AWS
 * Shield Standard, the WAF attachment point, and an optional custom domain.
 *
 * Caching is disabled so redirects always reach the origin (accurate click
 * counts); the value of CloudFront here is TLS/edge/security, not caching.
 * The Host header is stripped before reaching API Gateway, which rejects a
 * mismatched Host on its execute-api endpoint.
 */
export class UrlCdn extends Construct {
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: UrlCdnProps) {
    super(scope, id);

    const { httpApi, config } = props;
    const region = Stack.of(this).region;
    const originDomain = `${httpApi.apiId}.execute-api.${region}.amazonaws.com`;
    const origin = new HttpOrigin(originDomain, {
      protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
    });

    let zone: IHostedZone | undefined;
    let certificate: Certificate | undefined;
    let domainNames: string[] | undefined;
    if (config.domainName && config.hostedZoneName) {
      zone = HostedZone.fromLookup(this, 'Zone', { domainName: config.hostedZoneName });
      certificate = new Certificate(this, 'Certificate', {
        domainName: config.domainName,
        validation: CertificateValidation.fromDns(zone),
      });
      domainNames = [config.domainName];
    }

    this.distribution = new Distribution(this, 'Distribution', {
      comment: `url-shortener-${config.environment}`,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      domainNames,
      certificate,
      webAclId: props.webAclArn,
      priceClass: PriceClass.PRICE_CLASS_100, // cheapest footprint (NA + EU)
    });

    if (zone && config.domainName) {
      const target = RecordTarget.fromAlias(new CloudFrontTarget(this.distribution));
      new ARecord(this, 'AliasA', { zone, recordName: config.domainName, target });
      new AaaaRecord(this, 'AliasAaaa', { zone, recordName: config.domainName, target });
    }

    new CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });
    new CfnOutput(this, 'PublicUrl', {
      value: `https://${config.domainName ?? this.distribution.distributionDomainName}`,
      description: 'Public base URL for the shortener',
    });
  }
}
