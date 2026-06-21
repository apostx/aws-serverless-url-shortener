#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { resolveConfig, EnvironmentName } from '../lib/config';
import { UrlShortenerStack } from '../lib/url-shortener-stack';

const app = new App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const environments: EnvironmentName[] = ['dev', 'prod'];

for (const environment of environments) {
  const config = resolveConfig(app, environment);

  const stack = new UrlShortenerStack(app, config.stackName, {
    env: { account, region: config.region },
    description: `Serverless URL Shortener — ${environment}`,
    config,
  });

  Tags.of(stack).add('Project', 'url-shortener');
  Tags.of(stack).add('Environment', environment);
  Tags.of(stack).add('ManagedBy', 'cdk');
}

app.synth();
