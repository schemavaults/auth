# @schemavaults/e2e-auth-tests

## About

This is a test-suite for the SchemaVaults Auth Platform.

## Helper Commands

See the [`@schemavaults/cypress-e2e-auth-tests-helper-commands` package](../cypress-e2e-auth-tests-helper-commands) for helper commands that are used within these test suites.

If using the package from within the repository via bun workspaces, you may need to build the helper commands first: `bun run build --filter @schemavaults/cypress-e2e-auth-tests-helper-commands` (from the monorepo root)

## Writing E2E Tests

The [./cypress/e2e/*](./cypress/e2e/) directory contains the actual E2E test files. Subdirectories are used to group test suites.
