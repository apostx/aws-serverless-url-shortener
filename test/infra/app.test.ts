import { App } from 'aws-cdk-lib';
import { resolveConfig } from '../../lib/config';
import { UrlShortenerStack } from '../../lib/url-shortener-stack';

describe('CDK application', () => {
  it('synthesizes both dev and prod stacks', () => {
    const app = new App();
    for (const environment of ['dev', 'prod'] as const) {
      const config = resolveConfig(app, environment);
      new UrlShortenerStack(app, config.stackName, {
        env: { account: '123456789012', region: 'us-east-1' },
        config,
      });
    }

    const assembly = app.synth();
    expect(assembly.stacks).toHaveLength(2);
    expect(assembly.stacks.map((s) => s.stackName).sort()).toEqual([
      'UrlShortener-Dev',
      'UrlShortener-Prod',
    ]);
  });
});

describe('resolveConfig', () => {
  it('defaults to us-east-1, no WAF, and a 302 redirect', () => {
    const app = new App();
    const config = resolveConfig(app, 'dev');
    expect(config.region).toBe('us-east-1');
    expect(config.enableWaf).toBe(false);
    expect(config.redirectStatusCode).toBe(302);
    expect(config.domainName).toBeUndefined();
  });

  it('enables alarms by default only for prod', () => {
    const app = new App();
    expect(resolveConfig(app, 'dev').enableAlarms).toBe(false);
    expect(resolveConfig(app, 'prod').enableAlarms).toBe(true);
  });

  it('throws when domainName is set without hostedZoneName', () => {
    const app = new App({ context: { domainName: 'go.example.com' } });
    expect(() => resolveConfig(app, 'prod')).toThrow(/hostedZoneName/);
  });

  it('honours environment-namespaced context overrides', () => {
    const app = new App({ context: { 'prod:enableWaf': 'true', enableWaf: 'false' } });
    expect(resolveConfig(app, 'prod').enableWaf).toBe(true);
    expect(resolveConfig(app, 'dev').enableWaf).toBe(false);
  });
});
