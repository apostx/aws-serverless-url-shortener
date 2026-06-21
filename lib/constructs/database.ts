import { RemovalPolicy } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { EnvironmentName } from '../config';

export interface UrlDatabaseProps {
  readonly environment: EnvironmentName;
}

/**
 * DynamoDB table that stores URL mappings.
 *
 * Item shape: `shortCode` (PK), `originalUrl`, `createdAt` (ISO), `ttl` (epoch
 * seconds, auto-expiry), `clicks` (atomic counter), `userId` (optional, GSI PK).
 *
 * Notes vs. the spec:
 *  - The table name is suffixed with the environment so dev and prod can coexist
 *    in the same account (a fixed name would clash on the second deploy).
 *  - Removal policy and deletion protection are environment-aware: prod is
 *    retained and protected; dev is destroyable for cheap teardown.
 */
export class UrlDatabase extends Construct {
  /** GSI for "all URLs created by a user" lookups. */
  public static readonly USER_INDEX_NAME = 'userId-index';

  public readonly table: Table;

  constructor(scope: Construct, id: string, props: UrlDatabaseProps) {
    super(scope, id);

    const isProd = props.environment === 'prod';

    this.table = new Table(this, 'Table', {
      tableName: `url-shortener-${props.environment}`,
      partitionKey: { name: 'shortCode', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST, // Free Tier friendly, $0 when idle
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'ttl',
      deletionProtection: isProd,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: UrlDatabase.USER_INDEX_NAME,
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
  }
}
