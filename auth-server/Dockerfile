# Dockerfile for @schemavaults/auth-server
#
# Runtime targets:
#   staging     Self-contained server image: Next.js standalone server plus
#               .next/static and public/. Runs stand-alone with no reverse
#               proxy in front (the Node server serves its own assets).
#   production  Slim server image for deployments behind an nginx reverse
#               proxy: the Next.js standalone server WITHOUT .next/static
#               (delegated to the `nginx` image / an external nginx site).
#               public/ is still included -- the server reads
#               public/branding-defaults/ with the fs module and the
#               /_next/image optimizer resolves public assets from disk.
#   nginx       Static-asset tier for the production image: nginx with
#               .next/static + public/ baked in and a templated site config
#               that reverse-proxies everything else to the server container.
#               See deploy/ at the monorepo root for a docker compose stack
#               wiring `production` + `nginx` together.
#   test        Like staging, but built with the /api/test routes retained
#               for the E2E suite.

ARG BUN_VERSION
ARG NODEJS_VERSION
ARG NGINX_VERSION=1.29-alpine

FROM oven/bun:${BUN_VERSION} AS bunbase
FROM node:${NODEJS_VERSION} AS nodejsbase
FROM nginx:${NGINX_VERSION} AS nginxbase

FROM bunbase AS deps

WORKDIR /schemavaults/auth

### Monorepo Root Package Details ###
COPY --chown=bun:bun package.json package.json
COPY --chown=bun:bun bun.lock bun.lock
COPY --chown=bun:bun turbo.json turbo.json

### Core Auth-Server ###
COPY --chown=bun:bun auth-server/package.json auth-server/package.json
COPY --chown=bun:bun auth-server/postcss.config.js auth-server/postcss.config.js
COPY --chown=bun:bun auth-server/tailwind.config.ts auth-server/tailwind.config.ts
COPY --chown=bun:bun auth-server/next.config.ts auth-server/next.config.ts
COPY --chown=bun:bun auth-server/eslint.config.cjs auth-server/eslint.config.cjs
COPY --chown=bun:bun auth-server/tsconfig.json auth-server/tsconfig.json

### Supporting Auth Packages (Config Files) ###

# @schemavaults/app-definitions
COPY --chown=bun:bun packages/app-definitions/package.json packages/app-definitions/package.json
COPY --chown=bun:bun packages/app-definitions/tsconfig.json packages/app-definitions/tsconfig.json
COPY --chown=bun:bun packages/app-definitions/eslint.config.cjs packages/app-definitions/eslint.config.cjs

# @schemavaults/auth-client-sdk
COPY --chown=bun:bun packages/auth-client-sdk/package.json packages/auth-client-sdk/package.json
COPY --chown=bun:bun packages/auth-client-sdk/tsconfig.json packages/auth-client-sdk/tsconfig.json
COPY --chown=bun:bun packages/auth-client-sdk/eslint.config.cjs packages/auth-client-sdk/eslint.config.cjs
COPY --chown=bun:bun packages/auth-client-sdk/generate-version.sh packages/auth-client-sdk/generate-version.sh
COPY --chown=bun:bun packages/auth-client-sdk/turbo.json packages/auth-client-sdk/turbo.json

# @schemavaults/auth-common
COPY --chown=bun:bun packages/auth-common/package.json packages/auth-common/package.json
COPY --chown=bun:bun packages/auth-common/tsconfig.json packages/auth-common/tsconfig.json
COPY --chown=bun:bun packages/auth-common/eslint.config.cjs packages/auth-common/eslint.config.cjs

# @schemavaults/auth-react-provider
COPY --chown=bun:bun packages/auth-react-provider/package.json packages/auth-react-provider/package.json
COPY --chown=bun:bun packages/auth-react-provider/tsconfig.json packages/auth-react-provider/tsconfig.json
COPY --chown=bun:bun packages/auth-react-provider/eslint.config.cjs packages/auth-react-provider/eslint.config.cjs

# @schemavaults/auth-resource-server-codegen-templates
COPY --chown=bun:bun packages/auth-resource-server-codegen-templates/package.json packages/auth-resource-server-codegen-templates/package.json
COPY --chown=bun:bun packages/auth-resource-server-codegen-templates/tsconfig.json packages/auth-resource-server-codegen-templates/tsconfig.json
COPY --chown=bun:bun packages/auth-resource-server-codegen-templates/eslint.config.cjs packages/auth-resource-server-codegen-templates/eslint.config.cjs

# @schemavaults/auth-server-sdk
COPY --chown=bun:bun packages/auth-server-sdk/package.json packages/auth-server-sdk/package.json
COPY --chown=bun:bun packages/auth-server-sdk/tsconfig.json packages/auth-server-sdk/tsconfig.json
COPY --chown=bun:bun packages/auth-server-sdk/eslint.config.cjs packages/auth-server-sdk/eslint.config.cjs
COPY --chown=bun:bun packages/auth-server-sdk/copy-codegen-templates.sh packages/auth-server-sdk/copy-codegen-templates.sh
COPY --chown=bun:bun packages/auth-server-sdk/prepare-cli.sh packages/auth-server-sdk/prepare-cli.sh

# @schemavaults/auth-ui
COPY --chown=bun:bun packages/auth-ui/package.json packages/auth-ui/package.json
COPY --chown=bun:bun packages/auth-ui/tsconfig.json packages/auth-ui/tsconfig.json
COPY --chown=bun:bun packages/auth-ui/eslint.config.cjs packages/auth-ui/eslint.config.cjs

# @schemavaults/jwt
COPY --chown=bun:bun packages/jwt/package.json packages/jwt/package.json
COPY --chown=bun:bun packages/jwt/tsconfig.json packages/jwt/tsconfig.json
COPY --chown=bun:bun packages/jwt/eslint.config.cjs packages/jwt/eslint.config.cjs

### Install packages
RUN bun install

FROM deps AS development

### Command to launch development environment
# You'll want to ensure that src/ directories are mounted
WORKDIR /schemavaults/auth
CMD [ "bun", "run", "dev", "--filter", "@schemavaults/auth-server" ]

FROM deps AS source

WORKDIR /schemavaults/auth

### Core Auth Server (Source Code) ###

COPY --chown=bun:bun auth-server/src/ auth-server/src/
COPY --chown=bun:bun auth-server/public/ auth-server/public/

### Supporting Auth Packages (Source Code) ###

# @schemavaults/app-definitions
COPY --chown=bun:bun packages/app-definitions/src/ packages/app-definitions/src/

# @schemavaults/auth-client-sdk
COPY --chown=bun:bun packages/auth-client-sdk/src/ packages/auth-client-sdk/src/

# @schemavaults/auth-common
COPY --chown=bun:bun packages/auth-common/src/ packages/auth-common/src/

# @schemavaults/auth-react-provider
COPY --chown=bun:bun packages/auth-react-provider/src/ packages/auth-react-provider/src/

# @schemavaults/auth-resource-server-codegen-templates
COPY --chown=bun:bun packages/auth-resource-server-codegen-templates/src/ packages/auth-resource-server-codegen-templates/src/

# @schemavaults/auth-server-sdk
COPY --chown=bun:bun packages/auth-server-sdk/src/ packages/auth-server-sdk/src/

# @schemavaults/auth-ui
COPY --chown=bun:bun packages/auth-ui/src/ packages/auth-ui/src/

# @schemavaults/jwt
COPY --chown=bun:bun packages/jwt/src/ packages/jwt/src/

### Source variant: production (test routes stripped so they cannot be served)
FROM source AS source-prod

WORKDIR /schemavaults/auth

RUN rm -rf auth-server/src/app/api/test

### Source variant: test (test routes retained for E2E suite)
FROM source AS source-test

### Build final server code (production) ###
FROM source-prod AS build-prod

WORKDIR /schemavaults/auth

ARG NEXT_INCLUDE_PRODUCTION_SOURCE_MAPS
ENV NEXT_INCLUDE_PRODUCTION_SOURCE_MAPS=$NEXT_INCLUDE_PRODUCTION_SOURCE_MAPS

# Build server
ENV NEXT_STANDALONE_DOCKER_BUILD true
ENV NEXT_TELEMETRY_DISABLED 1
RUN bun run build --filter @schemavaults/auth-server

# Build database migrations
WORKDIR /schemavaults/auth/auth-server
RUN bun run build:migrations

### Build final server code (test) ###
FROM source-test AS build-test

WORKDIR /schemavaults/auth

ARG NEXT_INCLUDE_PRODUCTION_SOURCE_MAPS
ENV NEXT_INCLUDE_PRODUCTION_SOURCE_MAPS=$NEXT_INCLUDE_PRODUCTION_SOURCE_MAPS

ENV NEXT_STANDALONE_DOCKER_BUILD true
ENV NEXT_TELEMETRY_DISABLED 1
RUN bun run build --filter @schemavaults/auth-server

WORKDIR /schemavaults/auth/auth-server
RUN bun run build:migrations

### Shared Node.js runtime base for the server images ###
FROM nodejsbase AS runtime

WORKDIR /schemavaults/auth/auth-server

EXPOSE 80
ENV PORT 80
ENV HOSTNAME 0.0.0.0

ENV NEXT_TELEMETRY_DISABLED 1
ENV NEXT_STANDALONE_DOCKER_BUILD true

# Set migrations path for runtime DB migrations
ENV MIGRATIONS_PATH /schemavaults/auth/auth-server/dist/migrations

CMD [ "node", "./.next/standalone/auth-server/server.js" ]

### Staging: self-contained server image (Node serves .next/static + public) ###
FROM runtime AS staging

COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/package.json package.json
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/.next/standalone/ .next/standalone/
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/.next/static/ .next/standalone/auth-server/.next/static/
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/public/ .next/standalone/auth-server/public/

# Copy compiled migrations for runtime DB migrations
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/dist/sql.js dist/sql.js
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/dist/migrations/ dist/migrations/

### Production: slim server image for use behind the nginx static tier ###
# .next/static is intentionally NOT copied in: an nginx reverse proxy (see the
# `nginx` target below and deploy/ at the monorepo root) serves /_next/static/.
# Requests for /_next/static/ that reach this image directly will 404 -- use
# the staging target for a self-contained image.
FROM runtime AS production

COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/package.json package.json
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/.next/standalone/ .next/standalone/
# public/ must remain in the server image even though nginx also serves it:
# the server reads public/branding-defaults/ from disk (fs module) to serve
# default branding assets, and the /_next/image optimizer resolves public
# assets (e.g. /icon.png rendered via next/image) from the local public dir.
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/public/ .next/standalone/auth-server/public/

# Copy compiled migrations for runtime DB migrations
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/dist/sql.js dist/sql.js
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/dist/migrations/ dist/migrations/

### Test: self-contained server image with /api/test routes retained ###
FROM runtime AS test

COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/package.json package.json
COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/.next/standalone/ .next/standalone/
COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/.next/static/ .next/standalone/auth-server/.next/static/
COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/public/ .next/standalone/auth-server/public/

COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/dist/sql.js dist/sql.js
COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/dist/migrations/ dist/migrations/

### Nginx static-asset tier for the production image ###
# Serves the content-hashed /_next/static/ build assets and public/ files from
# disk, and reverse-proxies every other request to the server container. The
# site config is rendered from deploy/nginx/templates/auth-server.conf.template
# by the stock nginx image entrypoint (envsubst on /etc/nginx/templates/),
# parameterized by the SERVER_NAME / AUTH_SERVER_UPSTREAM / STATIC_ROOT /
# CLIENT_MAX_BODY_SIZE environment variables defaulted below.
FROM nginxbase AS nginx

# Content-hashed Next.js build assets, served at /_next/static/
COPY --from=build-prod /schemavaults/auth/auth-server/.next/static/ /usr/share/nginx/html/_next/static/
# Public assets, served from the site root (e.g. /icon.png)
COPY --from=build-prod /schemavaults/auth/auth-server/public/ /usr/share/nginx/html/

# Replace the stock default site with the auth-server site template
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/templates/auth-server.conf.template /etc/nginx/templates/auth-server.conf.template

ENV SERVER_NAME _
ENV AUTH_SERVER_UPSTREAM schemavaults-auth:80
ENV STATIC_ROOT /usr/share/nginx/html
ENV CLIENT_MAX_BODY_SIZE 8m
