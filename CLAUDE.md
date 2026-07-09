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
POST => `{api_server_base_url}/api/test/seed/migrate-test-environment-db`

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

## White-label Branding

Text/color branding is env-var driven (`SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME`, `_DESCRIPTION`, `_THEME_COLOR_1/2`, resolved by `auth-server/src/lib/config/`; the friendly-name/description env resolution canonically lives in `@schemavaults/app-definitions` with the `lib/config/` modules as server-only delegates). Branding *images* (favicon, app icon, opengraph image) are administrator-uploadable at runtime: assets are stored base64 in the `server_branding_assets` table via the `BrandingAssetsRegistry` resource group (`auth-server/src/lib/auth-db/branding/`, Redis-cached) and served by the public `GET /branding/[asset]` route with ETag + cache-busted `?v=<content-hash>` URLs referenced from the root layout's `generateMetadata()` (`/favicon.ico` is rewritten to `/branding/favicon` in `next.config.ts`). When no custom asset is uploaded, the favicon/icon fall back to bundled defaults (`auth-server/public/branding-defaults/`, read+cached at serve time by `auth-server/src/lib/branding/default-assets/`) and the opengraph image is generated at request time with `next/og` from the friendly name, description, and theme colors (`auth-server/src/lib/branding/generated-og-image.ts`). Admins manage uploads on `/admin/settings` (`BrandingAssetsCard` in `auth-server/src/components/BrandingAssets/`) backed by `GET /api/admin/branding` and `PUT`/`DELETE /api/admin/branding/[asset]`.

User-facing *copy* interpolates the friendly name rather than hardcoding "SchemaVaults": server-side code calls `getAuthServerFriendlyName()` directly (transactional email subjects/bodies — verification, password reset, MFA security alerts, team invitations, daily admin report — plus the TOTP issuer and WebAuthn RP display name), auth-server client components read it from the `useAuthServerFriendlyName()` context (mounted in the root layout via `AuthServerFriendlyNameProvider`), and shared `@schemavaults/auth-ui` cards/dialogs read the package's own `useAuthUiFriendlyName()` context (fed by `AuthServerFriendlyNameProvider`; defaults to "SchemaVaults Auth" when no `AuthUiFriendlyNameProvider` is mounted, e.g. in external resource servers). The transactional email sender identity is configurable with `SCHEMAVAULTS_AUTH_SERVER_EMAIL_FROM_ADDRESS` (a plain email address, applied as the default `from` in `sendEmailViaMailServer`; the mail-server's default sender is used when unset).

The *owner organization* is also env-var driven: `SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION` (org ID, default `schemavaults`, throws if set but invalid) and `SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION_NAME` (display name, default "SchemaVaults"), resolved at call time by `getAuthServerOwnerOrganizationId()`/`getAuthServerOwnerOrganizationName()` in `@schemavaults/app-definitions` (server-side import surface: `auth-server/src/lib/config/auth-server-owner-organization.ts`). The auth server's own app/API definitions are built by the `getSchemaVaultsAuthAppDefinition()`/`getSchemaVaultsAuthApiDefinition()` factories (owner from the org getter, name/description from the friendly-name/description getters), the virtual system organization comes from `getHardcodedOrgs()` in `@schemavaults/auth-common`, and the configured ID is reserved (organization creation with it is blocked). Platform ownership is stored as a `NULL` `owner_organization_id` in the database, so changing the env var re-homes platform-owned rows automatically — but the ID must not collide with an existing organization row. Client components read the value from the `useAuthUiOwnerOrganizationId()` context (`AuthUiOwnerOrganizationProvider`, mounted in the root layout; defaults to `schemavaults` in external resource servers).

The auth server's *own app id* is env-var driven too: `SCHEMAVAULTS_AUTH_SERVER_APP_ID` (app ID, default `schemavaults-auth`, throws if set but invalid), resolved at call time by `getAuthServerAppId()` in `@schemavaults/app-definitions` (server-side import surface: `auth-server/src/lib/config/auth-server-app-id.ts`; the default is exported as `DEFAULT_AUTH_SERVER_APP_ID`, and the former `SCHEMAVAULTS_AUTH_APP_ID` constant export no longer exists). The id doubles as the auth server's own `api_server_id`, the JWT audience translation key, and the refresh-token cookie name suffix (`refresh_token_<id>` — renaming it logs every user out), and the hardcoded registries expose it via the call-time builders `getHardcodedAppIds()`/`getHardcodedApiServerIds()` (the module-scope `HARDCODED_*` const arrays were removed so the env var is never frozen at build time). Server-side code calls `getAuthServerAppId()` directly; client code must never call it (browser bundles silently get the default) — the `(client)/layout.tsx` server layout resolves it and threads it as a prop into `ClientAuthProvider`, which passes `app_id` + `auth_server_app_id` to the `AuthProvider` from `@schemavaults/auth-react-provider`; client components read it via `useAuthServerAppId()` (`AuthServerAppIdProvider` context, default `schemavaults-auth` in external resource servers) and `useIsAuthServer()` compares the two context values. The SDK layers accept an optional `auth_server_app_id` (`SchemaVaultsAuthClient` constructor option and `ReactAuthClientSdkAdapter` init option) so `isClientForAuthServer`-style checks work in white-label deployments. On the auth server deployment, `SCHEMAVAULTS_API_SERVER_ID` must be set to the same value (it is not auto-derived because external resource servers reuse that variable with their own IDs).

## Multi-Factor Authentication

TOTP-based MFA lives in `auth-server/src/lib/mfa/` (KEK, recovery-code HMAC, TOTP via `otplib`, QR rendering, Redis challenge store) plus the `MfaRegistry` resource group at `auth-server/src/lib/auth-db/mfa/`. The login handler intercepts users with a verified factor and returns an `mfa_required` discriminated-union variant instead of an authorization code; the client completes the flow at `POST /api/auth/mfa/verify`. Required env vars: `PRIVATE_MFA_SECRET_KEK`, `PRIVATE_MFA_RECOVERY_PEPPER` (both 32-byte base64).

The account-management UI lives in the auth-server `src/components/` (it is consumed only by the auth-server, not by external resource servers) and renders on the dedicated `/mfa` route: `src/components/Mfa/` owns `TotpSettingsCard` plus the TOTP dialogs (`TotpEnrollmentDialog`, `MfaRemoveFactorDialog`, `MfaRegenerateRecoveryCodesDialog`), `src/components/RecoveryCodesPanel/` owns `RecoveryCodesPanel`, and `src/components/Passkeys/` owns `PasskeysSettingsCard`/`PasskeysSettingsSection` (the WebAuthn browser ceremonies). `@schemavaults/auth-ui` retains the login challenge-flow components (`MfaChallengeForm`, `MfaFactorPicker`) used at `/auth/mfa`. The React state hook is `useMfa()` in `@schemavaults/auth-react-provider`.

## Continuous Integration & Continuous Delivery (C.I. & C.D. )
The `.github/workflows` directory contains GitHub Actions workflows for automatically testing & publishing the `@schemavaults/auth` application/package suite.

## E2E Testing

The `tests/e2e-auth-tests` directory contains Cypress E2E test suite for testing the auth server.
- `tests/e2e-auth-tests/cypress/support/e2e.ts`, `tests/e2e-auth-tests/cypress/support/commands.ts`, and `tests/e2e-auth-tests/cypress/support/actions/` contain reusable commands (e.g. `cy.login()`, `cy.register()`, etc.) for making writing tests easier.

The actual E2E tests live within the `tests/e2e-auth-tests/cypress/e2e/` directory.

## NextJS Documentation

Your training data is likely outdated; documentation on the current version of NextJS is available at: `./auth-server/node_modules/next/dist/docs/`.
