import { Duration } from 'aws-cdk-lib';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  Metric,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { AppConfig } from '../config';

export interface UrlObservabilityProps {
  readonly shorten: IFunction;
  readonly redirect: IFunction;
  readonly stats: IFunction;
  readonly table: ITable;
  readonly httpApi: HttpApi;
  readonly config: AppConfig;
}

const PERIOD = Duration.minutes(5);

/**
 * CloudWatch alarms, a dashboard, and an SNS alarm topic.
 *
 * Created only when `enableAlarms` is set (on by default for prod). All alarms
 * notify the SNS topic; provide `alarmEmail` to receive notifications.
 */
export class UrlObservability extends Construct {
  public readonly topic: Topic;
  public readonly dashboard: Dashboard;

  constructor(scope: Construct, id: string, props: UrlObservabilityProps) {
    super(scope, id);

    const { shorten, redirect, stats, table, httpApi, config } = props;
    const env = config.environment;

    this.topic = new Topic(this, 'AlarmTopic', {
      topicName: `url-shortener-alarms-${env}`,
      displayName: 'URL Shortener Alarms',
    });
    if (config.alarmEmail) {
      this.topic.addSubscription(new EmailSubscription(config.alarmEmail));
    }
    const onAlarm = new SnsAction(this.topic);

    const errorAlarm = (alarmId: string, fn: IFunction, label: string): void => {
      const alarm = new Alarm(this, alarmId, {
        alarmName: `url-shortener-${env}-${label}`,
        alarmDescription: `${label}: Lambda errors detected — check X-Ray traces and logs`,
        metric: fn.metricErrors({ period: PERIOD, statistic: 'Sum' }),
        threshold: 5,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(onAlarm);
    };

    errorAlarm('RedirectErrorsAlarm', redirect, 'redirect-errors');
    errorAlarm('ShortenErrorsAlarm', shorten, 'shorten-errors');

    new Alarm(this, 'SlowRedirectsAlarm', {
      alarmName: `url-shortener-${env}-slow-redirects`,
      alarmDescription: 'Redirect p99 latency above 500ms',
      metric: redirect.metricDuration({ period: PERIOD, statistic: 'p99' }),
      threshold: 500,
      evaluationPeriods: 3,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(onAlarm);

    new Alarm(this, 'DdbThrottlesAlarm', {
      alarmName: `url-shortener-${env}-ddb-throttles`,
      alarmDescription: 'DynamoDB request throttling detected',
      metric: this.dynamoMetric(table, 'ThrottledRequests'),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(onAlarm);

    new Alarm(this, 'Api5xxAlarm', {
      alarmName: `url-shortener-${env}-api-5xx`,
      alarmDescription: 'API Gateway 5xx responses',
      metric: this.apiMetric(httpApi, '5xx'),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(onAlarm);

    this.dashboard = new Dashboard(this, 'Dashboard', { dashboardName: `UrlShortener-${env}` });
    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Lambda invocations',
        left: [
          shorten.metricInvocations(),
          redirect.metricInvocations(),
          stats.metricInvocations(),
        ],
        width: 12,
      }),
      new GraphWidget({
        title: 'Lambda errors',
        left: [shorten.metricErrors(), redirect.metricErrors(), stats.metricErrors()],
        width: 12,
      }),
    );
    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'Redirect duration (p50 / p99)',
        left: [
          redirect.metricDuration({ statistic: 'p50' }),
          redirect.metricDuration({ statistic: 'p99' }),
        ],
        width: 12,
      }),
      new GraphWidget({
        title: 'API requests & errors',
        left: [this.apiMetric(httpApi, 'Count')],
        right: [this.apiMetric(httpApi, '4xx'), this.apiMetric(httpApi, '5xx')],
        width: 12,
      }),
    );
    this.dashboard.addWidgets(
      new GraphWidget({
        title: 'DynamoDB capacity & throttles',
        left: [table.metricConsumedReadCapacityUnits(), table.metricConsumedWriteCapacityUnits()],
        right: [this.dynamoMetric(table, 'ThrottledRequests')],
        width: 24,
      }),
    );
  }

  private apiMetric(httpApi: HttpApi, metricName: string): Metric {
    return new Metric({
      namespace: 'AWS/ApiGateway',
      metricName,
      dimensionsMap: { ApiId: httpApi.apiId },
      statistic: 'Sum',
      period: PERIOD,
    });
  }

  private dynamoMetric(table: ITable, metricName: string): Metric {
    return new Metric({
      namespace: 'AWS/DynamoDB',
      metricName,
      dimensionsMap: { TableName: table.tableName },
      statistic: 'Sum',
      period: PERIOD,
    });
  }
}
