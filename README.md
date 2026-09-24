# @schemavaults/auth
Welcome to the monorepo for the [SchemaVaults Auth Platform](https://auth.schemavaults.com).

## Repository Structure
The auth platform code is within a [Turborepo](https://turborepo.com/) repository using Bun workspaces for package installation.

### The `packages` directory
- [@schemavaults/app-definitions](./packages/app-definitions) - base types for client apps, API servers, and environments
- [@schemavaults/auth-client-sdk](./packages/auth-client-sdk) - TypeScript SDK for calling the auth server (OIDC code/refresh flows via `openid-client`)
- [@schemavaults/auth-common](./packages/auth-common) - shared auth types, middleware rules, PKCE, and hashing helpers
- [@schemavaults/auth-react-provider](./packages/auth-react-provider) - React hooks/context for auth state, built on `auth-client-sdk`
- [@schemavaults/auth-resource-server-codegen-templates](./packages/auth-resource-server-codegen-templates) - auth pages (login, register, logout, authorize, error) and `auth-provider.tsx` that the `auth-server-sdk codegen` CLI generates into Next.js resource-server apps (bundled into `auth-server-sdk`, not published on its own)
- [@schemavaults/auth-server-sdk](./packages/auth-server-sdk) - middleware and route guards for the auth server and resource servers, plus the `auth-server-sdk` codegen CLI
- [@schemavaults/auth-ui](./packages/auth-ui) - React components for auth flows and auth datatypes (users, organizations, apps, APIs)
- [@schemavaults/jwt](./packages/jwt) - JWT key management and token signing/verification
- [@schemavaults/openapi-docs-ui](./packages/openapi-docs-ui) - React components and Next.js `docs/` page factories for browsing an OpenAPI document
- [@schemavaults/openapi-operations](./packages/openapi-operations) - OpenAPI-representable HTTP operations (zod schemas + auth schemes + handlers), OpenAPI 3.1 document generation, and a Hono app factory for Vercel functions / Next.js route handlers
- [@schemavaults/trpc-backend-init](./packages/trpc-backend-init) - tRPC server-side router factory with SchemaVaults Auth access-token validation

### The `auth-server` application directory
In the [`auth-server`](./auth-server) directory is the code for the actual authentication/authorization server, which makes use of the packages in the [`packages`](./packages) directory.

### The `auth-postgres-db` directory
The [`auth-postgres-db`](./auth-postgres-db) directory contains utilities for launching/managing the dev/test versions of the Postgres database that `@schemavaults/auth-server` uses.

### The `tests` directory
- [@schemavaults/cypress-e2e-auth-tests-helper-commands](./tests/cypress-e2e-auth-tests-helper-commands) - reusable Cypress commands for the E2E suite
- [@schemavaults/e2e-auth-tests](./tests/e2e-auth-tests) - the Cypress E2E test suite
- [@schemavaults/example-nextjs-resource-server](./tests/example-nextjs-resource-server) - example Next.js resource server that logs in via the OAuth2 PKCE flow and trial-runs `openapi-operations` / `openapi-docs-ui`

## Development
See the [@schemavaults/auth-server README.md](./auth-server/README.md) for instructions on how to start the development server.

## Multi-Factor Authentication (TOTP + Recovery Codes)

The auth-server supports opt-in TOTP multi-factor authentication. When a user enrolls a verified factor, password login returns an `mfa_required` challenge instead of an authorization code; the client completes the flow at `/api/auth/mfa/verify`. Users without a factor are unaffected.

### Required environment variables

Both must be set in any environment that enrols users into MFA:

```bash
# 32-byte base64. AES-256-GCM key encrypting TOTP secrets at rest.
PRIVATE_MFA_SECRET_KEK="$(openssl rand -base64 32)"

# 32-byte base64. HMAC-SHA-256 pepper for recovery codes.
PRIVATE_MFA_RECOVERY_PEPPER="$(openssl rand -base64 32)"
```

`bun run dev:init-env` auto-generates fresh values for both on first run.

### Migrations

Two new migrations ship with this feature:

- `00020-user-mfa-factors-table.ts`
- `00021-user-mfa-recovery-codes-table.ts`

Apply them with `bun run dev:migrate` before starting the auth-server. Both migrations are additive and have clean `down()` functions; no existing tables are modified.

### Operational runbook

- **Stuck account / lost device** → admin calls `DELETE /api/admin/users/[uid]/mfa` (requires admin JWT). The user is emailed a `security-alert` notification and may re-enrol.
- **KEK or pepper rotation** → store both env vars in your secret manager. v1 always writes `kek_version = 1`; future rotation can introduce `PRIVATE_MFA_SECRET_KEK_V2` plus a re-encryption pass without a migration.
- **Losing the KEK** makes existing TOTP secrets unverifiable. Losing the recovery pepper makes recovery codes unverifiable. Treat both as production-critical secrets.

### Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/auth/mfa/verify` | Submit TOTP/recovery code against a challenge_id |
| `POST` | `/api/user/mfa/totp/enroll` | Begin TOTP enrolment (authenticated) |
| `POST` | `/api/user/mfa/totp/verify-enrollment` | Confirm enrolment + receive recovery codes |
| `DELETE` | `/api/user/mfa/totp/[factor_id]` | Remove a factor (requires current TOTP) |
| `POST` | `/api/user/mfa/recovery-codes/regenerate` | Replace recovery codes (requires current TOTP) |
| `GET` | `/api/user/mfa/status` | Read enrolment state |
| `DELETE` | `/api/admin/users/[uid]/mfa` | Admin reset, sends security-alert email |

## Production
**[https://auth.schemavaults.com](https://auth.schemavaults.com)**

### Building packages
Build all packages:
```bash
bun run build:packages
```

Build a specific package:
```bash
bun run build --filter @schemavaults/auth-server-sdk
```

### Build auth server
See the [@schemavaults/auth-server README.md](./auth-server/README.md) for build instructions.
