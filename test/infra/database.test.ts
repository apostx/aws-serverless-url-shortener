import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { EnvironmentName, resolveConfig } from '../../lib/config';
import { UrlShortenerStack } from '../../lib/url-shortener-stack';

function templateFor(environment: EnvironmentName): Template {
  const app = new App();
  const config = resolveConfig(app, environment);
  const stack = new UrlShortenerStack(app, config.stackName, {
    env: { account: '123456789012', region: 'us-east-1' },
    config,
  });
  return Template.fromStack(stack);
}

describe('UrlDatabase', () => {
  const dev = templateFor('dev');

  it('creates exactly one DynamoDB table', () => {
    dev.resourceCountIs('AWS::DynamoDB::Table', 1);
  });

  it('uses shortCode as PK with on-demand billing, encryption, TTL and PITR', () => {
    dev.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'url-shortener-dev',
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'shortCode', KeyType: 'HASH' }],
      SSESpecification: Match.objectLike({ SSEEnabled: true }),
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  it('defines the userId GSI with a createdAt sort key', () => {
    dev.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'userId-index',
          KeySchema: [
            { AttributeName: 'userId', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        }),
      ]),
    });
  });

  it('destroys the table in dev for cheap teardown', () => {
    dev.hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Delete' });
  });

  it('retains and protects the table in prod', () => {
    const prod = templateFor('prod');
    prod.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: Match.objectLike({
        TableName: 'url-shortener-prod',
        DeletionProtectionEnabled: true,
      }),
    });
  });
});
