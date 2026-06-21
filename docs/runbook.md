# Operations runbook

## Deploy

```bash
npx cdk bootstrap aws://<account-id>/us-east-1   # one-time
npx cdk deploy UrlShortener-Dev                  # default, ~$0
npx cdk deploy UrlShortener-Prod \
  -c prod:domainName=go.example.com -c prod:hostedZoneName=example.com \
  -c prod:enableWaf=true -c prod:alarmEmail=ops@example.com
```

Stack outputs: `ApiUrl`, `DistributionDomainName`, `PublicUrl`.

## Alarm response

| Alarm               | Likely cause                         | First actions                                                        |
| ------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| `*-redirect-errors` | Bad data, DynamoDB issue, regression | Check the redirect log group + X-Ray service map for the failing dep |
| `*-shorten-errors`  | Validation/throttling/regression     | Check shorten logs; confirm DynamoDB write capacity isn't throttled  |
| `*-slow-redirects`  | Cold starts or DynamoDB latency      | Inspect p99 widget; consider provisioned concurrency                 |
| `*-ddb-throttles`   | Hot partition / burst                | On-demand should absorb; check for a single hot `shortCode`          |
| `*-api-5xx`         | Integration/permission failure       | Check API Gateway + Lambda permissions and recent deploys            |

Dashboards: CloudWatch → Dashboards → `UrlShortener-<env>`. Traces: X-Ray
service map (API Gateway → Lambda → DynamoDB).

## Rollback

CDK/CloudFormation keeps the previous template. To roll back, redeploy the prior
commit:

```bash
git checkout <previous-good-sha>
npx cdk deploy UrlShortener-Prod --require-approval never
```

Failed deploys auto-roll-back to the last stable state. The DynamoDB table is
retained on prod (`RETAIN` + deletion protection) so application rollbacks never
risk data.

## Data recovery

Point-in-time recovery (PITR) is enabled (35-day window). Restore via the
DynamoDB console or `aws dynamodb restore-table-to-point-in-time` into a new
table, then repoint `TABLE_NAME`.

## Cost control

- WAF is the only non-trivial fixed cost (~$5/mo). Disable it when not needed:
  redeploy without `enableWaf`.
- Everything else is usage-priced and ~$0 at low traffic (PAY_PER_REQUEST
  DynamoDB, Lambda + HTTP API free tiers, CloudFront < 1 TB).

## Teardown

```bash
npx cdk destroy UrlShortener-Dev      # removes everything (dev table is DESTROY)
# Prod retains the table + its KMS-managed data by design; delete manually if intended.
```
