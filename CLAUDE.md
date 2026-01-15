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
```

### Building
```bash
bun run build                            # Build all packages
bun run build:server                     # Build just auth-server
```

### Linting
```bash
bun run lint                                         # Lint all packages via Turborepo
bun run lint --filter @schemavaults/auth-server      # Lint auth-server only
bun run lint --filter @schemavaults/auth-client-sdk  # Lint specific package
```

### Testing
```bash
# Unit tests (per-package using bun test)
bun run test --filter @schemavaults/jwt              # Run tests in jwt package
bun run test --filter @schemavaults/auth-common      # Run tests in auth-common package
bun run test --filter @schemavaults/auth-client-sdk  # Run tests in auth-client-sdk package
bun run test --filter @schemavaults/auth-server-sdk  # Run tests in auth-server-sdk package

# E2E tests (Cypress)
bun run e2e        # Run Cypress / Docker Compose testing pipeline
```

## Architecture

### Monorepo Structure
- **auth-server/**: Next.js 16 App Router application - the main auth server deployed at auth.schemavaults.com
- **packages/**: Shared TypeScript libraries published to npm
- **tests/e2e-auth-tests/**: Cypress E2E test suite

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
- `src/app/api/` - Next.js API routes (auth endpoints, admin endpoints, token management)
- `src/app/(client)/` - Client-side pages with route groups
- `src/app/(client)/(authenticated)/` - Routes requiring authentication
- `src/lib/auth-db/` - Database resource groups for users, organizations, apps, APIs, JWT keys
- `src/lib/AuthServerJwtKeysManager/` - JWT key lifecycle management

### Database
Uses `@schemavaults/dbh` with Kysely for Postgres (Neon serverless compatible). Tables are managed via resource groups in `src/lib/auth-db/`.

### Environment Variables
Copy `auth-server/.env.example` to `.env.local`. Key variables:
- `POSTGRES_*` - Database connection
- `PRIVATE_GLOBAL_PASSWORD_SALT` - For password hashing
- `PRIVATE_SUPERUSER_INVITE_CODE` - Creates admin invite code on first registration
