import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { resolveConfig } from '../../lib/config';
import { UrlShortenerStack } from '../../lib/url-shortener-stack';

function devTemplate(): Template {
  const app = new App();
  const config = resolveConfig(app, 'dev');
  const stack = new UrlShortenerStack(app, config.stackName, {
    env: { account: '123456789012', region: 'us-east-1' },
    config,
  });
  return Template.fromStack(stack);
}

describe('UrlFunctions', () => {
  const template = devTemplate();

  it('creates three Lambda functions on Node 22 / ARM64 with active tracing', () => {
    template.resourceCountIs('AWS::Lambda::Function', 3);
    template.allResourcesProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      TracingConfig: { Mode: 'Active' },
    });
  });

  it('injects the table name into the function environment', () => {
    template.hasResourceProperties(
      'AWS::Lambda::Function',
      Match.objectLike({
        Environment: { Variables: Match.objectLike({ TABLE_NAME: Match.anyValue() }) },
      }),
    );
  });

  it('grants write access for shorten/redirect and read access for stats', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: Match.arrayWith(['dynamodb:PutItem']) }),
        ]),
      },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: Match.arrayWith(['dynamodb:GetItem']) }),
        ]),
      },
    });
  });
});

describe('UrlApi', () => {
  const template = devTemplate();

  it('creates a single HTTP API', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'url-shortener-api',
      ProtocolType: 'HTTP',
    });
  });

  it('exposes the three expected routes', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 3);
    for (const routeKey of ['POST /shorten', 'GET /{code}', 'GET /stats/{code}']) {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: routeKey });
    }
  });

  it('outputs the API URL', () => {
    template.hasOutput('ApiUrl', {});
  });
});
