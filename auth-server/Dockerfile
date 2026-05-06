# Dockerfile for @schemavaults/auth-server (production)

ARG BUN_VERSION
ARG NODEJS_VERSION

FROM oven/bun:${BUN_VERSION} AS bunbase
FROM node:${NODEJS_VERSION} AS nodejsbase

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

FROM nodejsbase AS production

WORKDIR /schemavaults/auth

COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/package.json auth-server/package.json
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/.next/standalone/ auth-server/.next/standalone/
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/.next/static/ auth-server/.next/standalone/auth-server/.next/static/
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/public/ auth-server/.next/standalone/auth-server/public/

# Copy compiled migrations for runtime DB migrations
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/dist/sql.js auth-server/dist/sql.js
COPY --from=build-prod --chown=nodejs:nodejs /schemavaults/auth/auth-server/dist/migrations/ auth-server/dist/migrations/

WORKDIR /schemavaults/auth/auth-server

EXPOSE 80
ENV PORT 80
ENV HOSTNAME 0.0.0.0

ENV NEXT_TELEMETRY_DISABLED 1
ENV NEXT_STANDALONE_DOCKER_BUILD true

# Set migrations path for production
ENV MIGRATIONS_PATH /schemavaults/auth/auth-server/dist/migrations

CMD [ "node", "./.next/standalone/auth-server/server.js" ]

FROM nodejsbase AS test

WORKDIR /schemavaults/auth

COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/package.json auth-server/package.json
COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/.next/standalone/ auth-server/.next/standalone/
COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/.next/static/ auth-server/.next/standalone/auth-server/.next/static/
COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/public/ auth-server/.next/standalone/auth-server/public/

COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/dist/sql.js auth-server/dist/sql.js
COPY --from=build-test --chown=nodejs:nodejs /schemavaults/auth/auth-server/dist/migrations/ auth-server/dist/migrations/

WORKDIR /schemavaults/auth/auth-server

EXPOSE 80
ENV PORT 80
ENV HOSTNAME 0.0.0.0

ENV NEXT_TELEMETRY_DISABLED 1
ENV NEXT_STANDALONE_DOCKER_BUILD true

ENV MIGRATIONS_PATH /schemavaults/auth/auth-server/dist/migrations

CMD [ "node", "./.next/standalone/auth-server/server.js" ]
