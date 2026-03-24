# Dockerfile for @schemavaults/example-nextjs-resource-server

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

# Copy helper script for removing "./auth-server" from 'workspaces' definitions. we only need packages and tests.
COPY scripts/remove-auth-server-from-workspaces-definition.sh scripts/remove-auth-server-from-workspaces-definition.sh

# Set permissions for the helper script
RUN chmod +x scripts/remove-auth-server-from-workspaces-definition.sh
RUN /bin/bash ./scripts/remove-auth-server-from-workspaces-definition.sh

### Example Resource Server Config Files ###
COPY --chown=bun:bun tests/example-nextjs-resource-server/package.json tests/example-nextjs-resource-server/package.json
COPY --chown=bun:bun tests/example-nextjs-resource-server/postcss.config.js tests/example-nextjs-resource-server/postcss.config.js
COPY --chown=bun:bun tests/example-nextjs-resource-server/tailwind.config.ts tests/example-nextjs-resource-server/tailwind.config.ts
COPY --chown=bun:bun tests/example-nextjs-resource-server/next.config.ts tests/example-nextjs-resource-server/next.config.ts
COPY --chown=bun:bun tests/example-nextjs-resource-server/tsconfig.json tests/example-nextjs-resource-server/tsconfig.json

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
CMD [ "bun", "run", "dev", "--filter", "@schemavaults/example-nextjs-resource-server" ]

FROM deps AS source

WORKDIR /schemavaults/auth

### Example Resource Server (Source Code) ###

COPY --chown=bun:bun tests/example-nextjs-resource-server/src/ tests/example-nextjs-resource-server/src/
COPY --chown=bun:bun tests/example-nextjs-resource-server/public/ tests/example-nextjs-resource-server/public/

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

# @schemavaults/jwt
COPY --chown=bun:bun packages/jwt/src/ packages/jwt/src/

### Build final server code ###
FROM source AS build

WORKDIR /schemavaults/auth

# Build server
ENV NEXT_STANDALONE_DOCKER_BUILD true
ENV NEXT_TELEMETRY_DISABLED 1
RUN bun run build --filter @schemavaults/example-nextjs-resource-server

FROM nodejsbase AS production

WORKDIR /schemavaults/auth

COPY --from=build --chown=nodejs:nodejs /schemavaults/auth/tests/example-nextjs-resource-server/package.json tests/example-nextjs-resource-server/package.json
COPY --from=build --chown=nodejs:nodejs /schemavaults/auth/tests/example-nextjs-resource-server/.next/standalone/ tests/example-nextjs-resource-server/.next/standalone/
COPY --from=build --chown=nodejs:nodejs /schemavaults/auth/tests/example-nextjs-resource-server/.next/static/ tests/example-nextjs-resource-server/.next/standalone/tests/example-nextjs-resource-server/.next/static/
COPY --from=build --chown=nodejs:nodejs /schemavaults/auth/tests/example-nextjs-resource-server/public/ tests/example-nextjs-resource-server/.next/standalone/tests/example-nextjs-resource-server/public/

WORKDIR /schemavaults/auth/tests/example-nextjs-resource-server

EXPOSE 80
ENV PORT 80
ENV HOSTNAME 0.0.0.0

ENV NEXT_TELEMETRY_DISABLED 1
ENV NEXT_STANDALONE_DOCKER_BUILD true

CMD [ "node", "./.next/standalone/tests/example-nextjs-resource-server/server.js" ]
