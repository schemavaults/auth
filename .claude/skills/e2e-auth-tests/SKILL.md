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

Called by PR, feature-branch, and main-branch CI workflows via `workflow_call`. It:

1. **Builds Docker images in parallel** (4 jobs): auth server, postgres DB, e2e test runner, example resource server
2. **Builds the e2e CLI** (`bun run build:cli --filter @schemavaults/e2e-auth-tests`)
3. **Fans out to per-suite jobs** — each suite is a separate job that calls the reusable `run-e2e-test-suite.yml` workflow with `test-suite-name: <folder_name>` and `skip-docker-build: true` (uses the pre-built image artifacts)

Each suite job runs on its own CI runner in parallel. The `example_resource_server` suite additionally depends on `Build-Resource-Server-Docker-Image` and passes `load-resource-server-image: true`.

If creating new fresh test suite then it will need to be added to this `run-e2e-tests.yml` workflow as a new job.

### `run-e2e-test-suite.yml` (per-suite executor)

Reusable workflow that:

1. Downloads pre-built Docker image artifacts and loads them into Docker
2. Downloads the pre-built CLI artifact
3. Runs: `bun run cli e2e <test-suite-name> [--verbose] [--skip-build]`
4. Uploads Cypress screenshots as artifacts on failure (1.5 day retention)

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
- `cy.create_and_login_as_regular_user(credentials)` — creates and logs in a regular user
- `cy.generate_random_test_user_credentials()` — generates random email/password
- `cy.login(email, password)` / `cy.logout()`
- `cy.wait_for_page_hydration()` — waits for Next.js hydration
- `cy.create_app(...)` / `cy.create_api_server(...)` / `cy.create_organization(...)` / `cy.delete_organization(...)`
- `cy.register(email, password, invite_code)`

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

## Key files

| File | Purpose |
| ---- | ------- |
| `tests/e2e-auth-tests/cypress.config.ts` | Cypress config, setup hooks, env vars |
| `tests/e2e-auth-tests/e2e-auth-tests-cli.ts` | CLI for listing/running suites via Docker Compose |
| `tests/e2e-auth-tests/docker-compose.yml` | Docker services (auth server, postgres, test runner, resource server) |
| `tests/e2e-auth-tests/cypress/support/commands.ts` | Registers custom Cypress commands |
| `tests/e2e-auth-tests/cypress/support/e2e.ts` | Cypress support entry point |
| `tests/e2e-auth-tests/cypress/support/triggerTestEnvironmentDbMigration.ts` | DB migration with retry logic |
| `tests/e2e-auth-tests/cypress/support/pre-register-superuser.ts` | Pre-creates superuser for non-superuser suites |
| `tests/e2e-auth-tests/cypress/support/seed-app-and-api-for-example-resource-server.ts` | Seeds example resource server data |
| `.github/workflows/run-e2e-tests.yml` | CI orchestrator: builds images, fans out to per-suite jobs |
| `.github/workflows/run-e2e-test-suite.yml` | CI per-suite executor: loads images, runs CLI, uploads artifacts |
