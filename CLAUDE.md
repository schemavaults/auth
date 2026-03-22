# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **SchemaVaults Auth Platform** monorepo - an authentication/authorization server built with Next.js 16 and React 19. It uses Turborepo with Bun workspaces for package management.

## Commands

### Development
```bash
bun install                              # Install all dependencies
bun run dev --filter @schemavaults/auth-server  # Run auth-server dev (port 6767)
bun run dev:server                       # Shortcut for the above
bun run dev:migrate                      # Run database migrations for dev auth-server
```

### Building
```bash
bun run build                            # Build all packages
bun run build:server                     # Build just auth-server
bun run build:packages                   # Build all auth packages in the packages/ directory
```

### Linting
```bash
bun run lint                                         # Lint all packages via Turborepo
bun run lint --filter @schemavaults/auth-server      # Lint auth-server only
bun run lint --filter @schemavaults/auth-client-sdk  # Lint specific package
```

### Type Checking
```bash
bun run typecheck                                          # Type check all packages via Turborepo
bun run typecheck --filter @schemavaults/auth-server       # Type check auth-server only
bun run typecheck --filter @schemavaults/auth-client-sdk   # Type check specific package
bun run typecheck --filter @schemavaults/auth-server-sdk   # Type check specific package
bun run typecheck --filter @schemavaults/auth-common       # Type check specific package
bun run typecheck --filter @schemavaults/jwt               # Type check specific package
bun run typecheck --filter @schemavaults/app-definitions   # Type check specific package
bun run typecheck --filter @schemavaults/auth-ui           # Type check specific package
bun run typecheck --filter @schemavaults/e2e-auth-tests    # Type check test workspace
```

### One-off Commands
```bash
# We use bun, not npm/yarn
# So use bunx where you would use npx
bunx tsc --noEmit
# Raw bunx calls should be avoided where possible to ensure that you have permission! For typechecking / linting use the appropriate Turborepo commands added to the root package.json
```

### Testing
```bash
# Unit tests (per-package using bun test)
bun run test --filter @schemavaults/jwt              # Run tests in jwt package
bun run test --filter @schemavaults/auth-common      # Run tests in auth-common package
bun run test --filter @schemavaults/auth-client-sdk  # Run tests in auth-client-sdk package
bun run test --filter @schemavaults/auth-server-sdk  # Run tests in auth-server-sdk package
```

## Architecture

### Monorepo Structure
- **auth-server/**: Next.js 16 App Router application - the main auth server deployed at auth.schemavaults.com
- **packages/**: Shared TypeScript libraries published to npm & GitHub Packages
- **tests/e2e-auth-tests/**: Cypress E2E test suite
- **tests/example-nextjs-resource-server/**: Example Next.js resource server for testing login via OAuth2 PKCE flow

### Package Dependency Hierarchy
```
@schemavaults/app-definitions     ← Base types for apps/environments
        ↓
@schemavaults/auth-common         ← Shared auth types, middleware rules, PKCE, hashing
        ↓
@schemavaults/jwt                 ← JWT key management, token signing/verification (uses jose)
        ↓
@schemavaults/auth-server-sdk     ← Server-side middleware, route protection for resource servers
@schemavaults/auth-client-sdk     ← Client SDK for API calls to auth server
        ↓
@schemavaults/auth-react-provider ← React hooks/context for auth state (uses SWR)
        ↓
@schemavaults/auth-ui             ← React components for auth flows (login, register, etc.)
```

### auth-server Structure
- `src/app/` - Next.js App Directory
- `src/app/api/` - Next.js API routes (auth endpoints, admin endpoints, token management)
- `src/app/(client)/` - Client-side pages with route groups
- `src/app/(client)/(authenticated)/` - Routes requiring authentication
- `src/lib/auth-db/` - Database resource groups for users, organizations, apps, APIs, JWT keys
- `src/components/` - Next.js/React.js client components specific to the auth server
- `src/lib/AuthServerJwtKeysManager/` - JWT key lifecycle management

### Building UI Components

All user interfaces should be built using `@schemavaults/ui` and `@schemavaults/theme`. Most shadcn & radixui components are available from here.

### UI Components

- `@schemavaults/auth-ui` - React components for working with auth datatypes (e.g. users table, organizations table, apps table, APIs table)
- `@schemavaults/auth-server/src/components` - React components for auth-server flows (login, register, etc.)

### Database
Uses `@schemavaults/dbh` with Kysely for Postgres (Neon serverless compatible). Tables are managed via resource groups in `src/lib/auth-db/`.

##### Starting development database
```bash
bun run dev:db
# you may also need to run migrations (if changing database schema or first run)
```

#### Database Migrations

##### Making changes to the database schema
- Make sure that the live database types are defined in `src/lib/auth-db/auth-database-types.ts`. New tables should be defined here.
- Database migrations are defined in `src/lib/auth-db/migrations/` to make the database match the live database types. New migrations are in the format `<5 digit chronological migration id>_<migration_name>.ts`. If the last update was `00012_my_twelth_migration.ts`, the next migration should be `00013_my_thirteenth_migration.ts`. Each migration file should have a `up` and `down` function that defines the migration and its reverse operation.

##### Database Migration in Development
Database migrations need to be run before starting the auth-server (if changing database schema or first run):
```bash
bun run dev:migrate
```

##### Database Migration for E2E tests
POST => `{api_server_base_url}/api/admin/migrate-test-environment-db`

The E2E Cypress tests will automatically run migrations before the test suite by using this endpoint.

### Environment Variables
Copy `auth-server/.env.example` to `.env.local`. Key variables:
- `POSTGRES_*` - Database connection
- `PRIVATE_GLOBAL_PASSWORD_SALT` - For password hashing
- `PRIVATE_SUPERUSER_INVITE_CODE` - Creates admin invite code on first registration

There is an interactive helper script for initializing environment variables for the development environment:
```bash
bun run dev:init-env
```

## Continuous Integration & Continuous Delivery (C.I. & C.D. )
The `.github/workflows` directory contains GitHub Actions workflows for automatically testing & publishing the `@schemavaults/auth` application/package suite.

## E2E Testing

The `tests/e2e-auth-tests` directory contains Cypress E2E test suite for testing the auth server.
- `tests/e2e-auth-tests/cypress/support/e2e.ts`, `tests/e2e-auth-tests/cypress/support/commands.ts`, and `tests/e2e-auth-tests/cypress/support/actions/` contain reusable commands (e.g. `cy.login()`, `cy.register()`, etc.) for making writing tests easier.

The actual E2E tests live within the `tests/e2e-auth-tests/cypress/e2e/` directory.
