# Serverless URL Shortener

A production-grade URL shortener (bit.ly clone) built end-to-end on AWS with **AWS CDK v2 + TypeScript**.
Submit a long URL, get a short code (`https://go.example.com/Xk3pQ`), and redirects resolve in tens of
milliseconds from the CloudFront edge.

> Portfolio project demonstrating serverless, IaC, security, and observability best practices for an AWS
> Solutions Architect. The original brief is in [`docs/requirements/`](docs/requirements/).

## Architecture

```
Route 53 (opt) ─► CloudFront ─► [WAF v2 (opt)] ─► API Gateway HTTP API v2 ─► Lambda ─► DynamoDB
                      │                                                          │
                      └─ ACM TLS (opt)                                          └─► CloudWatch + X-Ray
```

| Route               | Handler    | Behaviour                                            |
| ------------------- | ---------- | ---------------------------------------------------- |
| `POST /shorten`     | `shorten`  | Validate URL, generate/claim code, write to DynamoDB |
| `GET /{code}`       | `redirect` | Look up code, increment clicks, **302** to target    |
| `GET /stats/{code}` | `stats`    | Return click metrics as JSON                         |

All AWS resources deploy to **us-east-1** (required for CloudFront WAF + ACM). Lambda runs on
**Node.js 22 / ARM64**.

## Cost & opt-in extras

The stack deploys at **~$0** within the Free Tier by default. These production extras are **opt-in via
CDK context** so the repo is cheap and reproducible:

| Extra                          | Context flag                            | Default   | Notes                          |
| ------------------------------ | --------------------------------------- | --------- | ------------------------------ |
| Custom domain (Route 53 + ACM) | `domainName` + `hostedZoneName`         | off       | Needs a hosted zone you own    |
| WAF v2 WebACL                  | `enableWaf=true`                        | off       | ~$5/mo base charge             |
| CloudWatch alarms + dashboard  | `enableAlarms=true`                     | on (prod) | Add `alarmEmail` for SNS email |
| Redirect status code           | `redirectStatusCode=301\|302\|307\|308` | `302`     | 302 keeps links editable       |

## Prerequisites

- Node.js **≥ 22**, npm
- AWS CLI v2 configured (`aws configure`) — only needed to deploy
- AWS CDK v2 (`npx cdk` uses the locally pinned version)

## Quick start

```bash
npm install
npm run lint        # ESLint
npm test            # Jest unit + infra tests
npm run synth       # cdk synth (no AWS account required)
```

## Deploying

```bash
# One-time per account/region
npx cdk bootstrap aws://<account-id>/us-east-1

# Default deploy (CloudFront default domain, no WAF, ~$0)
npx cdk deploy UrlShortener-Dev

# With production extras
npx cdk deploy UrlShortener-Prod \
  -c prod:domainName=go.example.com \
  -c prod:hostedZoneName=example.com \
  -c prod:enableWaf=true \
  -c prod:alarmEmail=you@example.com
```

After deploy, the API base URL is printed as the `ApiUrl` / `DistributionDomainName` stack output:

```bash
curl -X POST "$API_URL/shorten" -H 'Content-Type: application/json' \
  -d '{"originalUrl":"https://aws.amazon.com/lambda"}'      # → 201 { shortUrl, shortCode }
curl -i "$API_URL/<code>"                                    # → 302 Location: <originalUrl>
curl "$API_URL/stats/<code>"                                 # → 200 { shortCode, clicks, ... }
```

## Scripts

| Script                  | Purpose                     |
| ----------------------- | --------------------------- |
| `npm run build`         | Type-check (`tsc --noEmit`) |
| `npm test`              | Run all Jest tests          |
| `npm run test:coverage` | Tests with coverage gate    |
| `npm run lint`          | ESLint                      |
| `npm run format`        | Prettier write              |
| `npm run synth`         | `cdk synth`                 |

## Project layout

```
bin/app.ts                 CDK app entry (dev + prod stacks)
lib/config.ts              Context → typed AppConfig
lib/url-shortener-stack.ts Stack composition
lib/constructs/            database, api, cdn, waf, observability
lib/lambda/                shorten, redirect, stats handlers (+ shared/)
test/unit/                 Lambda handler tests (aws-sdk-client-mock)
test/infra/                CDK assertion + snapshot tests
load/                      Artillery load test
```

## CI/CD

- **CI** (`.github/workflows/ci.yml`): on every push/PR — ESLint, Prettier check,
  type-check, Jest with coverage, and `cdk synth`. PRs also run commitlint.
- **Deploy** (`.github/workflows/deploy.yml`): dev → prod via GitHub OIDC, gated
  behind the `DEPLOY_ENABLED` variable; prod requires a GitHub Environment
  reviewer. The file header documents the one-time IAM/OIDC setup.
- **Releases**: [release-please](https://github.com/googleapis/release-please)
  opens a release PR that bumps the version and updates `CHANGELOG.md` from the
  Conventional Commit history.

## Load testing

See [load/README.md](load/README.md): `npx artillery run -t <url> load/load-test.yml`.

## Documentation

- [Architecture & design decisions](docs/architecture.md)
- [Operations runbook](docs/runbook.md)
- [Original spec](docs/requirements/)

## Contributing

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and automated SemVer.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
