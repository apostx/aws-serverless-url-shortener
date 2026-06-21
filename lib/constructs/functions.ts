import { join } from 'path';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, NodejsFunctionProps, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { AppConfig } from '../config';

export interface UrlFunctionsProps {
  readonly table: Table;
  readonly config: AppConfig;
}

const LAMBDA_DIR = join(__dirname, '..', 'lambda');

/**
 * The three request handlers as bundled (esbuild) Node.js 22 / ARM64 Lambdas
 * with X-Ray active tracing, dedicated log groups, and least-privilege grants:
 * shorten writes, redirect updates (atomic counter), stats reads.
 */
export class UrlFunctions extends Construct {
  public readonly shorten: NodejsFunction;
  public readonly redirect: NodejsFunction;
  public readonly stats: NodejsFunction;

  constructor(scope: Construct, id: string, props: UrlFunctionsProps) {
    super(scope, id);

    const { table, config } = props;

    const baseEnvironment: Record<string, string> = {
      TABLE_NAME: table.tableName,
      POWERTOOLS_SERVICE_NAME: 'url-shortener',
      POWERTOOLS_LOG_LEVEL: config.environment === 'prod' ? 'INFO' : 'DEBUG',
      NODE_OPTIONS: '--enable-source-maps',
    };
    if (config.domainName) {
      baseEnvironment.PUBLIC_DOMAIN = config.domainName;
    }

    const logRetention =
      config.environment === 'prod' ? RetentionDays.ONE_MONTH : RetentionDays.ONE_WEEK;

    const define = (
      name: string,
      file: string,
      extraEnvironment: Record<string, string> = {},
    ): NodejsFunction => {
      const props: NodejsFunctionProps = {
        runtime: Runtime.NODEJS_22_X,
        architecture: Architecture.ARM_64, // cheaper + faster cold starts
        entry: join(LAMBDA_DIR, file),
        handler: 'handler',
        memorySize: 256,
        timeout: Duration.seconds(10),
        tracing: Tracing.ACTIVE,
        environment: { ...baseEnvironment, ...extraEnvironment },
        logGroup: new LogGroup(this, `${name}Logs`, {
          retention: logRetention,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        bundling: {
          minify: true,
          sourceMap: true,
          target: 'node22',
          format: OutputFormat.CJS,
          // AWS SDK v3 ships in the runtime; keep it external to shrink bundles.
          externalModules: ['@aws-sdk/*'],
        },
      };
      return new NodejsFunction(this, name, props);
    };

    this.shorten = define('Shorten', 'shorten.ts');
    this.redirect = define('Redirect', 'redirect.ts', {
      REDIRECT_STATUS_CODE: String(config.redirectStatusCode),
    });
    this.stats = define('Stats', 'stats.ts');

    // Least-privilege: each function gets only the table actions it uses.
    table.grantWriteData(this.shorten); // PutItem
    table.grantWriteData(this.redirect); // UpdateItem (atomic ADD + ReturnValues)
    table.grantReadData(this.stats); // GetItem
  }
}
