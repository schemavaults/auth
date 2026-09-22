#!/bin/bash
# Vercel build entrypoint for @schemavaults/auth-server.
#
# Referenced by vercel.json's "buildCommand". Vercel runs it with the project's
# Root Directory (auth-server/) as the working directory, for both the Git
# integration (push-to-deploy) and the CLI path used by CI (`vercel build`).
#
# Behaviour is tuned per Vercel project through environment variables, so
# third-party deployments of this repository can customise the build in the
# Vercel dashboard without editing vercel.json:
#
#   SCHEMAVAULTS_VERCEL_BUILD_RUN_MIGRATIONS=true
#       After a successful Next.js build, apply pending database migrations to
#       the database configured by the project's environment variables. Only
#       honoured when VERCEL_ENV=production so preview builds never migrate.
#       A failed migration fails the build, so a broken schema change is never
#       deployed. The main SchemaVaults production project leaves this unset
#       and applies migrations from the GitHub Actions pipeline after deploy.
#
#   SCHEMAVAULTS_VERCEL_BUILD_STRIP_TEST_ROUTES=true
#       Remove src/app/api/test before building so the /api/test/* seed
#       endpoints are absent from the bundle. Those routes are already gated
#       at runtime by the app environment; this mirrors what the CI deploy
#       workflow does for the main production project. Only honoured when
#       VERCEL_ENV=production.
set -euo pipefail

AUTH_SERVER_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$AUTH_SERVER_DIRECTORY/.." && pwd)"

is_true() {
  case "${1:-}" in
    true|TRUE|True|1|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

IS_PRODUCTION_BUILD=false
if [ "${VERCEL_ENV:-}" = "production" ]; then
  IS_PRODUCTION_BUILD=true
fi

if [ "$IS_PRODUCTION_BUILD" = true ] && is_true "${SCHEMAVAULTS_VERCEL_BUILD_STRIP_TEST_ROUTES:-}"; then
  echo "[vercel-build] Stripping /api/test routes from the production build"
  rm -rf "$AUTH_SERVER_DIRECTORY/src/app/api/test"
fi

echo "[vercel-build] Building @schemavaults/auth-server"
(cd "$MONOREPO_ROOT" && bun run build:server)

if is_true "${SCHEMAVAULTS_VERCEL_BUILD_RUN_MIGRATIONS:-}"; then
  if [ "$IS_PRODUCTION_BUILD" = true ]; then
    echo "[vercel-build] Applying database migrations (VERCEL_ENV=production)"
    cd "$AUTH_SERVER_DIRECTORY"
    bun run build:migrations
    # The project's environment variables are already present in the build
    # environment, so no .env file needs to be pulled or sourced.
    MIGRATIONS_PATH="$AUTH_SERVER_DIRECTORY/dist/migrations" \
      bun run ./src/lib/auth-db/migrate-to-latest.ts
    echo "[vercel-build] Finished applying database migrations"
  else
    echo "[vercel-build] Skipping database migrations (VERCEL_ENV=${VERCEL_ENV:-unset}, not production)"
  fi
fi
