import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
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

describe('UrlObservability — disabled (dev default)', () => {
  const template = templateFor();

  it('creates no alarms, dashboard, or SNS topic', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 0);
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 0);
    template.resourceCountIs('AWS::SNS::Topic', 0);
  });
});

describe('UrlObservability — enabled', () => {
  const template = templateFor({ enableAlarms: 'true', alarmEmail: 'ops@example.com' });

  it('creates the five alarms, a dashboard, and an SNS topic', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 5);
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    template.resourceCountIs('AWS::SNS::Topic', 1);
  });

  it('subscribes the alarm email to the topic', () => {
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'ops@example.com',
    });
  });

  it('wires every alarm to an SNS action', () => {
    const alarms = template.findResources('AWS::CloudWatch::Alarm');
    expect(Object.keys(alarms)).toHaveLength(5);
    for (const alarm of Object.values(alarms)) {
      expect(alarm.Properties.AlarmActions).toBeDefined();
      expect(alarm.Properties.AlarmActions.length).toBeGreaterThan(0);
    }
  });
});

describe('UrlObservability — prod default', () => {
  it('enables alarms automatically for prod', () => {
    const template = templateFor({}, 'prod');
    template.resourceCountIs('AWS::CloudWatch::Alarm', 5);
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  });
});
