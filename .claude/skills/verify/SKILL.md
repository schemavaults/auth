---
name: verify
description: How to boot and drive the auth-server locally to verify changes at the real web surface (dev DB without Docker, WS proxy stand-in, Playwright drive). Use when verifying auth-server changes end-to-end in an environment where the docker compose dev DB is unavailable.
---

# Verifying auth-server changes at the running app

## Normal path (Docker available)

```bash
bun run dev:db        # docker compose: postgres:17.7 + ghcr.io/schemavaults/dbh/postgres-ws-proxy on :5433
yes "" | bun run dev:init-env   # writes auth-server/.env.development (accept defaults; superuser invite code = "superuser")
bun run dev:migrate
bun run dev:server    # Next.js dev server on http://localhost:6767
```

## Sandboxed environments (no Docker daemon / registry pulls blocked)

The app's dev DB access goes through the Neon serverless driver, which
tunnels raw Postgres wire bytes over WebSocket to `ws://localhost:5433/v1`
(see `getPostgresNeonWsProxyUrl` in `@schemavaults/dbh`). Both halves can be
stood up without containers:

1. **Postgres**: server binaries are often preinstalled at
   `/usr/lib/postgresql/<v>/bin` even when not on PATH. Postgres refuses to
   run as root — run `initdb`/`pg_ctl` as an unprivileged user in a directory
   that user owns (e.g. `/home/user/.pg-verify`), then apply
   `auth-postgres-db/docker-entrypoint-initdb.d/init-db.sql` to create the
   `schemavaults-auth-server-dev` role/database.
2. **WS proxy stand-in**: a ~40-line Bun script serving WebSocket on :5433
   that pipes binary frames to TCP 127.0.0.1:5432 fully replaces the
   `postgres-ws-proxy` container in dev (no TLS, no protocol negotiation).
3. Redis: `redis-server --daemonize yes` (add `REDIS_URL="redis://localhost:6379"`
   to `.env.development`).
4. Then `bun run dev:migrate` and `bun run dev:server` as usual.

### Test environment + example resource server (resource-server sign-in flows)

To drive a client app's sign-in (codegen'd `/auth/{login,authorize,error}`
pages), mirror `tests/e2e-auth-tests/docker-compose.yml` instead:

- Run the auth server with `SCHEMAVAULTS_APP_ENVIRONMENT=test` (the
  `/api/test/*` seed routes refuse other environments) and the compose
  file's env, plus `SCHEMAVAULTS_DBH_ADAPTER=postgres` + `POSTGRES_HOST=127.0.0.1`
  / `POSTGRES_PORT=5432` (direct TCP: no WS proxy needed) and
  `MIGRATIONS_PATH=<auth-server>/dist/migrations` (`bun run build:migrations`).
- The test environment's defaults are hostnames: the auth server URL is
  `http://schemavaults-auth` (port 80) and Redis is `schemavaults-auth-redis`
  (REDIS_URL is not enough). Map `schemavaults-auth`,
  `schemavaults-auth-redis` and `example-nextjs-resource-server` to 127.0.0.1
  in `/etc/hosts`.
- `POST /api/test/seed/migrate-test-environment-db`, then
  `POST /api/test/seed/create-test-nextjs-app/00000000-0000-0000-0000-000000000000`
  with `{ url: "http://example-nextjs-resource-server:3007", jwks_access_public_key }`
  (key pair from `generateJwtSigningKeyPair()` in `@schemavaults/jwt`; the
  example app takes the private key as base64url in
  `SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY`, plus the compose file's other env).
- Use production builds (`next build` + `next start`, `NODE_ENV=production`)
  for both apps: in this sandbox `next dev` pages render but never hydrate
  (the hydration marker stays `data-hydrated="false"`). `bun run build:packages`
  first so the apps pick up package changes. `next dev` also writes
  `AGENTS.md`/`CLAUDE.md` into the app directory; delete them.
- Launch Chromium with `--no-proxy-server` (it otherwise sends WebSockets
  through the sandbox proxy).

## Driving flows

- Chromium for Playwright lives at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (`playwright-core` + `executablePath`, `--no-sandbox`). Set
  `NO_PROXY=localhost` for curl/fetch against :6767.
- Registration (`/auth/register`): fill email, BOTH password inputs
  (password + confirm), and invite code `superuser` (dev default; it is
  single-use — the first registration consumes it, later runs must log in
  as that user instead). Success lands on `/account`.
- White-label copy surfaces worth checking: `/help` FAQ (accordion answers
  render only after click), `/account` (AccountCard + header Logo alt),
  register/login cards, toast copy after registering.
- Authenticated API probes: `page.request` shares the browser session's
  cookies (e.g. `POST /api/user/mfa/totp/enroll` returns the `otpauth://`
  URL including the issuer).

## Not observable locally

Transactional email content/sender can't be exercised without a configured
schemavaults mail-server: `sendEmailViaMailServer` fails at
`resolveMailServerId` before building the request, and callers tolerate the
failure (registration still succeeds). Verify email copy by reading the
built subjects/bodies, not at runtime.
