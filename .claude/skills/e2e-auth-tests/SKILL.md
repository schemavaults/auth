---
name: e2e-auth-tests
description: How the Cypress E2E test suite is organized, run locally, and executed in CI. Use when writing, debugging, or adding E2E tests, when working with the `run-e2e-tests.yml` or `run-e2e-test-suite.yml` workflows, or when touching anything under `tests/e2e-auth-tests/`.
---

# E2E Auth Tests

The E2E test suite lives in `tests/e2e-auth-tests/` and uses Cypress. Tests run inside Docker containers orchestrated by `docker-compose.yml`.

## Test suite organization

Each **subdirectory** of `tests/e2e-auth-tests/cypress/e2e/` is a discrete test suite. For example, `tests/e2e-auth-tests/cypress/e2e/login/*` contains login related test suites. Suites are discovered dynamically at runtime by reading the filesystem (see `e2e-auth-tests-cli.ts:listTestSuites()`), so adding a new folder automatically registers a new suite — no config changes needed in the CLI or Cypress config.

The current suites may be listed with the command: `cd tests/e2e-auth-tests && bun run cli suites`

## CI architecture

Two workflow files work together (`.github/workflows/`):

### `run-e2e-tests.yml` (orchestrator)

Called via `workflow_call` by the pull request workflow (`on-pull-request.yml`, the only CI for feature branches: pushes to them do not trigger a separate run) and the main-branch workflow (`on-push-main-branch-prod-cicd.yml`). It:

1. **Builds Docker images in parallel** (4 jobs): auth server, postgres DB, e2e test runner, example resource server. Each image is uploaded as a zstd archive (`docker save | zstd`, artifact `compression-level: 0` so it is not compressed twice)
2. **Builds the e2e CLI** (`bun run build:cli --filter @schemavaults/e2e-auth-tests`)
3. **Fans out to per-suite jobs** — each suite is a separate job that calls the reusable `run-e2e-test-suite.yml` workflow with `test-suite-name: <folder_name>` and `skip-docker-build: true` (uses the pre-built image artifacts)

Each suite job runs on its own CI runner in parallel. The `example_resource_server` suite additionally depends on `Build-Resource-Server-Docker-Image` and passes `load-resource-server-image: true`.

### Sharded suites

The longest suites are split across several runners so no single job dominates the run: `organizations` (4 shards), `example_resource_server` (3) and `admin` (2). Their job has a `strategy.matrix` over shard numbers (`fail-fast: false`) and passes `shard-index: ${{ matrix.shard }}` and `shard-total: <N>` to `run-e2e-test-suite.yml`, which runs `bun run cli e2e <suite> --shard <index>/<N>`.

- The CLI (`e2e-shards.ts`) splits the suite's spec files into N shards of similar estimated duration (longest spec first, onto the least-loaded shard) using the per-spec seconds in `tests/e2e-auth-tests/e2e-spec-durations.ts`. A spec without an entry counts as the suite's median, so new specs need no entry; every spec lands in exactly one shard (the CLI throws otherwise). `bun run cli shards <suite> <N>` prints the plan.
- The shard's specs reach Cypress through the `E2E_SPEC_PATTERN` env var, which `docker-compose.yml` interpolates into `cypress run --spec` (it falls back to the whole suite folder). `TEST_SUITE_NAME` stays the suite name, so per-suite setup in `cypress.config.ts` (seeding, white-label env) runs on every shard.
- Each shard gets its own fresh stack and database, so a spec must never depend on another spec of its suite having run first.
- Every run logs a `[e2e-spec-durations] {...}` JSON line (`after:run` hook in `cypress.config.ts`); copy those numbers into `e2e-spec-durations.ts` when a suite's shards drift apart.
- To shard another suite, add the same `name`/`strategy`/`shard-index`/`shard-total` lines to its job. Pick N so each shard stays below the longest unsharded suite; each extra runner costs ~2 minutes of image download/load before its first spec.

The `api_contract` suite pins the wire contract of the auth server's `/api/*` routes independently of the UI: success-path response envelopes, every accepted credential source (session cookie, bearer access token, access-token cookie), `text/plain` JSON bodies, the service-account lifecycle, and the generated `GET /api/openapi.json` document + `/docs` pages. Extend it whenever an endpoint's request/response shape changes.

If creating new fresh test suite then it will need to be added to this `run-e2e-tests.yml` workflow as a new job.

### `run-e2e-test-suite.yml` (per-suite executor)

Reusable workflow that:

1. Downloads pre-built Docker image artifacts and loads them into Docker (in parallel)
2. Downloads the pre-built CLI artifact
3. Runs: `bun run cli e2e <test-suite-name> [--shard <index>/<total>] [--verbose] [--skip-build]`
4. Uploads Cypress screenshots as artifacts on failure (1.5 day retention; the artifact name carries `-shard-<i>-of-<N>` for sharded suites)

### Adding a new suite to CI

When you add a new suite folder under `cypress/e2e/`, you must also add a corresponding job in `run-e2e-tests.yml`. Copy an existing job block and change the `test-suite-name` input. If the suite needs the example resource server, add `Build-Resource-Server-Docker-Image` to `needs` and set `load-resource-server-image: true`.

## Running locally

From `tests/e2e-auth-tests/`:

```bash
# List available suites
bun run cli suites

# Run a specific suite (builds + launches Docker Compose)
bun run cli e2e login

# Run with verbose output (all container logs, not just test runner)
bun run cli e2e login --verbose

# Run one shard of a suite, as CI does, and show how a suite is sharded
bun run cli e2e organizations --shard 2/4
bun run cli shards organizations 4

# Skip Docker image builds (use pre-built images)
bun run cli e2e login --skip-build

# Open Cypress interactive UI (for local development against a running server)
bun run open
```

The CLI selects docker-compose profile `e2e` for most suites, or `e2e_with_resource_server` for suites whose name contains `resource_server`.

## Cypress config setup hooks

`cypress.config.ts` runs conditional setup in its `before:run` hook when `SCHEMAVAULTS_APP_ENVIRONMENT=test`:

1. **DB migration** — calls `POST /api/test/seed/migrate-test-environment-db` with exponential backoff (resets the test database)
2. **Superuser pre-registration** — for all suites except `superuser`, pre-registers the superuser account so tests can skip the slow register flow and go straight to login. Sets `PRIVATE_SUPERUSER_PRECREATED=true` in Cypress env.
3. **Example resource server seeding** — only for the `example_resource_server` suite: seeds the database with an app/API configuration and validates JWKS keys

The `TEST_SUITE_NAME` environment variable (set by the CLI and passed through Docker Compose) controls which conditional setup runs.

## Custom Cypress commands

Custom commands come from the `@schemavaults/cypress-e2e-auth-tests-helper-commands` package, registered in `cypress/support/commands.ts` via `registerAllActionCommands()`. Key commands:

- `cy.create_and_login_as_superuser()` — registers or logs in as superuser
- `cy.create_and_login_as_regular_user(credentials)` — creates and logs in a regular user through the registration form; `cy.create_and_login_as_regular_user_via_request(credentials)` does the same by request (prefer it unless the spec is about the form). When an invite code is required and `credentials` has none, both create one through `POST /api/admin/invite-codes` as the superuser (`cy.create_invite_code()` is the `/admin/invite_codes` UI flow, kept for specs about that page)
- `cy.generate_random_test_user_credentials()` — generates random email/password
- `cy.login(email, password)` / `cy.logout()` (UI flows) and their faster `cy.login_via_request()` / `cy.logout_via_request()` equivalents
- `cy.wait_for_page_hydration()` — waits for Next.js hydration
- `cy.create_app(...)` / `cy.create_api_server(...)` / `cy.create_organization(...)` / `cy.delete_organization(...)`
- `cy.register(email, password, invite_code)`
- `cy.verify_email_via_request(email)` — marks a user's e-mail address verified through the real flow (test-only `GET /api/test/email-verification-token/{email}` + public `POST /api/auth/verify-email/confirm`, handling the confirm rate limit). Call it right after creating any user that a spec signs in to a **third-party** client app (the example resource server, a dynamically registered client, an app created by request): while the `require_email_verification_for_third_party_apps` server setting is on (the default), `POST /api/auth/login` / `register` / `mfa/verify` for a third-party `client_app_id` answer `kind: "email_verification_required"` (no `authorization_code`) and park the user on `/auth/verify-email/required`, and `POST /api/auth/session/generate-authorization-code` answers 403 `error_id: "email_verification_required"`. First-party flows (the auth server's own app id) are never gated. `cy.register_via_resource_server_pkce_flow()` / `cy.login_via_resource_server_pkce_flow()` verify the address themselves when they hit the interstitial; every other third-party sign-in must verify up front. The gate itself is pinned by `example_resource_server/EmailVerificationRequiredForThirdPartyApps.cy.ts`.

## Writing a new test

1. Create a `*.cy.ts` file in the appropriate suite folder under `cypress/e2e/<suite>/`
2. Cypress auto-discovers it — no imports or registration needed
3. Use the custom commands above for common setup (login, create resources, etc.)
4. Tests use dynamically generated data (random credentials/IDs), not fixtures

## Adding a new test suite

1. Create a new folder under `tests/e2e-auth-tests/cypress/e2e/<new_suite_name>/`
2. Add test files (`*.cy.ts`) to it
3. Add a job in `.github/workflows/run-e2e-tests.yml` that calls `run-e2e-test-suite.yml` with `test-suite-name: <new_suite_name>`
4. If the suite needs special setup (like `example_resource_server`), add conditional logic in `cypress.config.ts`'s `before:run` hook keyed on `TEST_SUITE_NAME`
5. If the suite needs custom environment variables on the auth-server or test-runner containers (like `white_label`, which runs the server with a non-default `SCHEMAVAULTS_AUTH_SERVER_APP_ID` and custom branding env), add a per-suite branch in `e2e-auth-tests-cli.ts`'s `launchDockerComposeTests()` that sets them in the child process env, and reference them from `docker-compose.yml` with `${VAR:-default}` interpolation so every other suite keeps the default behavior
6. Binary upload fixtures (e.g. the `white_label` suite's PNG branding images) live in `tests/e2e-auth-tests/cypress/fixtures/` (copied into the test-runner image by the Dockerfile)

## Key files

| File | Purpose |
| ---- | ------- |
| `tests/e2e-auth-tests/cypress.config.ts` | Cypress config, setup hooks, env vars |
| `tests/e2e-auth-tests/e2e-auth-tests-cli.ts` | CLI for listing/running suites (or one shard of a suite) via Docker Compose |
| `tests/e2e-auth-tests/e2e-shards.ts` | Splits a suite's specs into shards of similar duration (`--shard`) |
| `tests/e2e-auth-tests/e2e-spec-durations.ts` | Per-spec CI durations the shard planner balances with |
| `tests/e2e-auth-tests/docker-compose.yml` | Docker services (auth server, postgres, test runner, resource server) |
| `tests/e2e-auth-tests/cypress/support/commands.ts` | Registers custom Cypress commands |
| `tests/e2e-auth-tests/cypress/support/e2e.ts` | Cypress support entry point |
| `tests/e2e-auth-tests/cypress/support/triggerTestEnvironmentDbMigration.ts` | DB migration with retry logic |
| `tests/e2e-auth-tests/cypress/support/pre-register-superuser.ts` | Pre-creates superuser for non-superuser suites |
| `tests/e2e-auth-tests/cypress/support/seed-app-and-api-for-example-resource-server.ts` | Seeds example resource server data |
| `.github/workflows/run-e2e-tests.yml` | CI orchestrator: builds images, fans out to per-suite (and per-shard) jobs |
| `.github/workflows/run-e2e-test-suite.yml` | CI per-suite executor: loads images, runs CLI, uploads artifacts |

## White-label app id in specs

Specs and helper commands never hardcode the auth server's own app id: they resolve it with `getAuthServerAppIdFromCypressEnv()` from `@schemavaults/cypress-e2e-auth-tests-helper-commands`, which reads the `SCHEMAVAULTS_AUTH_SERVER_APP_ID` Cypress env var (defaulted in `cypress.config.ts` from the same-named process env var, overridable via `CYPRESS_SCHEMAVAULTS_AUTH_SERVER_APP_ID`; falls back to `schemavaults-auth`). Set it to the deployment's `SCHEMAVAULTS_AUTH_SERVER_APP_ID` to run the suite against a white-label auth server with a custom app id. Node-context config code (`setupNodeEvents`, e.g. `pre-register-superuser.ts`) receives the value via `config.env` instead, since the `Cypress` global doesn't exist there.
