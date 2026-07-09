# @schemavaults/e2e-auth-tests

## About

This is a test-suite for the SchemaVaults Auth Platform.

## Helper Commands

See the [`@schemavaults/cypress-e2e-auth-tests-helper-commands` package](../cypress-e2e-auth-tests-helper-commands) for helper commands that are used within these test suites.

If using the package from within the repository via bun workspaces, you may need to build the helper commands first: `bun run build --filter @schemavaults/cypress-e2e-auth-tests-helper-commands` (from the monorepo root)

## Writing E2E Tests

The [./cypress/e2e/*](./cypress/e2e/) directory contains the actual E2E test files. Subdirectories are used to group test suites.

Suite-specific environment variables (e.g. the `white_label` suite's non-default `SCHEMAVAULTS_AUTH_SERVER_APP_ID` and custom branding values) are injected by per-suite branches in [`e2e-auth-tests-cli.ts`](./e2e-auth-tests-cli.ts) and interpolated into the auth-server and test-runner containers by [`docker-compose.yml`](./docker-compose.yml) with `${VAR:-default}` fallbacks, so all other suites keep the default deployment configuration.

Binary fixtures for upload tests (e.g. the `white_label` suite's PNG branding images) live in [./cypress/fixtures/](./cypress/fixtures/) and are copied into the test-runner image by the [Dockerfile](./Dockerfile).
