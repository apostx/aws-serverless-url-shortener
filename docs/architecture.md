# Architecture

## Service diagram

```mermaid
flowchart LR
  client([Client])
  r53["Route 53<br/>(optional)"]
  cf["CloudFront<br/>edge TLS + Shield"]
  waf["WAFv2<br/>(optional)"]
  api["API Gateway<br/>HTTP API v2"]
  subgraph lambdas["Lambda — Node 22 / ARM64"]
    sh[shorten]
    rd[redirect]
    st[stats]
  end
  ddb[("DynamoDB<br/>url-mappings")]
  cw["CloudWatch<br/>logs / metrics / alarms"]
  xr[X-Ray]

  client --> r53 --> cf
  client --> cf
  cf --> waf --> api
  api --> sh --> ddb
  api --> rd --> ddb
  api --> st --> ddb
  lambdas -.-> cw
  lambdas -.-> xr
  api -.-> cw
```

CloudFront always fronts the API (edge TLS termination, AWS Shield Standard, and
the WAF attachment point). Route 53 / ACM and WAFv2 are opt-in via CDK context.

## Request flows

```mermaid
sequenceDiagram
  participant C as Client
  participant API as HTTP API
  participant L as Lambda
  participant D as DynamoDB

  Note over C,D: Shorten
  C->>API: POST /shorten { originalUrl }
  API->>L: invoke shorten
  L->>L: validate URL (SSRF-safe)
  L->>D: PutItem (attribute_not_exists guard)
  D-->>L: ok / ConditionalCheckFailed
  L-->>C: 201 { shortCode, shortUrl }

  Note over C,D: Redirect
  C->>API: GET /{code}
  API->>L: invoke redirect
  L->>D: UpdateItem (exists & not expired) ADD clicks, RETURN_NEW
  D-->>L: originalUrl
  L-->>C: 302 Location: originalUrl
```

## Data model (single table)

| Attribute        | Type | Role                                   |
| ---------------- | ---- | -------------------------------------- |
| `shortCode`      | S    | Partition key                          |
| `originalUrl`    | S    | Destination                            |
| `createdAt`      | S    | ISO timestamp                          |
| `ttl`            | N    | Unix epoch; DynamoDB TTL auto-expiry   |
| `clicks`         | N    | Atomic counter                         |
| `lastAccessedAt` | S    | ISO timestamp of last redirect         |
| `userId`         | S    | Optional; GSI `userId-index` partition |

## Key design decisions

- **302, not 301.** Permanent redirects are cached by browsers forever, which
  breaks click counting and makes a link's destination uneditable. The status
  code is configurable (`redirectStatusCode`).
- **Single atomic redirect.** One conditional `UpdateItem` verifies existence
  and TTL, increments `clicks`, and returns the destination — no read-then-write
  race, one round-trip.
- **SSRF-safe validation.** Only `http(s)`; private, loopback, link-local
  (incl. `169.254.169.254`) and internal hosts are rejected.
- **Least privilege.** shorten/redirect get write-only, stats read-only; each
  function has its own log group and role.
- **Opt-in production extras.** Custom domain, WAF, and alarms are off by
  default so the stack runs at ~$0 and is reproducible by anyone.
- **`NodejsFunction` (esbuild).** Handlers are bundled and tree-shaken;
  `@aws-sdk/*` is kept external (already in the runtime).
