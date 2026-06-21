# Contributing

## Development workflow

```bash
npm install      # also installs Husky git hooks
npm run lint
npm test
npm run synth
```

Husky runs two hooks automatically:

- **pre-commit** → `lint-staged` (ESLint `--fix` + Prettier on staged files)
- **commit-msg** → `commitlint` (validates the message below)

## Commit messages — Conventional Commits

Format: `type(scope): subject`

```
feat(api): add stats endpoint
fix(lambda): reject data: URLs in validation
docs: document custom-domain context flags
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

**Scopes** (optional): `db`, `lambda`, `api`, `cdn`, `security`, `observability`, `ci`, `release`,
`docs`, `deps`, `test`.

**Breaking changes:** append `!` after the type/scope (`feat(api)!: ...`) or add a
`BREAKING CHANGE:` footer.

## Versioning & releases

Semantic Versioning is automated by [release-please](https://github.com/googleapis/release-please):

- `fix:` → patch (`x.y.Z`)
- `feat:` → minor (`x.Y.0`)
- `feat!:` / `BREAKING CHANGE:` → major (`X.0.0`)

On merge to `main`, release-please maintains a release PR that updates the version and `CHANGELOG.md`.
Merging that PR tags the release. Do **not** bump versions by hand.

## Tests

- `test/unit/` — Lambda handler logic, DynamoDB mocked with `aws-sdk-client-mock`.
- `test/infra/` — CDK `Template` assertions and snapshots.

Add or update tests with every behavioural change; CI enforces lint, tests, and `cdk synth`.
