# Load testing

[Artillery](https://www.artillery.io/) drives a warm-up → ramp → peak profile
(up to 100 req/s for 5 minutes) exercising the shorten + redirect path.

## Run

```bash
# Against the deployed dev/prod environment (use the CloudFront or API URL):
TARGET_URL="https://<api-or-cloudfront-domain>" \
  npx artillery@latest run -t "$TARGET_URL" load/load-test.yml

# With an HTML report:
npx artillery@latest run -t "$TARGET_URL" --output results.json load/load-test.yml
npx artillery@latest report results.json
```

The run fails (non-zero exit) if the `ensure` thresholds are breached, making it
CI-friendly.

## Targets & tuning

| Metric      | Target   | If breached                                   |
| ----------- | -------- | --------------------------------------------- |
| p50 latency | < 20 ms  | Check CloudFront cache/hit ratio and region   |
| p95 latency | < 100 ms | Inspect Lambda duration; raise memory         |
| p99 latency | < 200 ms | Enable Lambda provisioned concurrency         |
| Error rate  | < 0.1 %  | Check DynamoDB throttles (PAY_PER_REQUEST)    |
| Cold starts | < 1 %    | ARM64 + Node 22 minimise init; warm if needed |

> Load testing creates real DynamoDB items and Lambda invocations. Run against a
> dev environment and clean up afterwards (`cdk destroy UrlShortener-Dev`).
