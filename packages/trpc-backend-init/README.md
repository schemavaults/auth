# @schemavaults/trpc-backend-init

Repository for easily initializing a tRPC server with SchemaVaults Auth access token validation.

## What This Package Does

`@schemavaults/trpc-backend-init` is a tRPC server-side router factory for the SchemaVaults ecosystem. It provides an abstract base class that microservices extend to get type-safe tRPC routers with built-in JWT authentication middleware. The "virtual backend" pattern lets client SDKs target a single router interface that routes to the correct microservice (registry server, regional vault filesystem servers).

## Commands

- **Build**: `bun run build` (runs `tsc` then `tsc-alias` to resolve `@/*` path aliases, then removes test files from dist)
- **Test**: `bun run test` (sets `SCHEMAVAULTS_APP_ENVIRONMENT=test NODE_ENV=test`)
- **Run single test**: `SCHEMAVAULTS_APP_ENVIRONMENT=test NODE_ENV=test bun test src/context/load_auth_context.test.ts`

## Architecture

### Core Components

- **`SchemaVaults_tRPC_Backend<R>`** (`src/schemavaults-trpc-backend.ts`) — Abstract class that consuming services extend. Generic over `R extends Base_SchemaVaults_tRPC_Resources` to allow each service to inject its own resources into the tRPC context. Initializes tRPC once via `initTRPC` and exposes `router` and `lazy` builders.

- **Context** (`src/context/`) — `createContext()` factory builds the tRPC context per-request. Calls `loadAuthContext()` which extracts the Bearer token, validates the JWT via `RemoteJwtKeyManager` from `@schemavaults/auth-server-sdk`, and populates `user` and `user_organizations` (or null if unauthenticated).

- **Procedures** (`src/procedures/`) — `createProcedures()` factory builds three procedure levels using tRPC middleware:
  - `publicProcedure` — no auth required
  - `authorizedProcedure` — requires authenticated user (throws UNAUTHORIZED)
  - `adminProcedure` — requires authenticated admin user (throws FORBIDDEN)

### Key Types (exported from `src/index.ts`)

- `SchemaVaults_tRPC_Context<R>` — The context shape including `user`, `user_organizations`, `connected_server_resources`, `jwt_audience`, `environment`, `debug`
- `SchemaVaults_tRPC_Runtime` — The initialized tRPC instance type
- `SchemaVaults_tRPC_Procedures` — The procedure set type

### Dependencies

- `@trpc/server` (v11) — tRPC framework
- `@schemavaults/auth-server-sdk` — JWT validation and remote key management
- `@schemavaults/app-definitions` — Environment types, auth server URIs, app config

## Environment Variables

- `SCHEMAVAULTS_APP_ENVIRONMENT` — App environment (development/test/staging/production)
- `SCHEMAVAULTS_API_SERVER_ID` — JWT audience identifier (required for auth context)
- `SCHEMAVAULTS_GITHUB_PACKAGE_REGISTRY_TOKEN` — For installing/publishing to GitHub Packages

## Conventions

- Path alias `@/*` maps to `./src/*` — resolved at build time by `tsc-alias`
- Tests use Bun's built-in test runner (`import { describe, expect, test } from "bun:test"`)
- Test files (`*.test.ts`) live alongside source files and are excluded from dist by the postbuild cleanup
- Published to GitHub Packages NPM registry (`@schemavaults` scope)
- CI runs on push to main: build → test → publish via GitHub Actions
