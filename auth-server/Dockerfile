# Dockerfile for @schemavaults/auth-server (production)

ARG BUN_VERSION

FROM oven/bun:${BUN_VERSION} AS bunbase

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


### Supporting Auth Packages (Config Files) ###

# @schemavaults/app-definitions
COPY --chown=bun:bun packages/app-definitions/package.json packages/app-definitions/package.json
COPY --chown=bun:bun packages/app-definitions/tsconfig.json packages/app-definitions/tsconfig.json
COPY --chown=bun:bun packages/app-definitions/eslint.config.cjs packages/app-definitions/eslint.config.cjs

# @schemavaults/auth-client-sdk
COPY --chown=bun:bun packages/auth-client-sdk/package.json packages/auth-client-sdk/package.json
COPY --chown=bun:bun packages/auth-client-sdk/tsconfig.json packages/auth-client-sdk/tsconfig.json
COPY --chown=bun:bun packages/auth-client-sdk/eslint.config.cjs packages/auth-client-sdk/eslint.config.cjs

# @schemavaults/auth-common
COPY --chown=bun:bun packages/auth-common/package.json packages/auth-common/package.json
COPY --chown=bun:bun packages/auth-common/tsconfig.json packages/auth-common/tsconfig.json
COPY --chown=bun:bun packages/auth-common/eslint.config.cjs packages/auth-common/eslint.config.cjs

# @schemavaults/auth-react-provider
COPY --chown=bun:bun packages/auth-react-provider/package.json packages/auth-react-provider/package.json
COPY --chown=bun:bun packages/auth-react-provider/tsconfig.json packages/auth-react-provider/tsconfig.json
COPY --chown=bun:bun packages/auth-react-provider/eslint.config.cjs packages/auth-react-provider/eslint.config.cjs

# @schemavaults/auth-server-sdk
COPY --chown=bun:bun packages/auth-server-sdk/package.json packages/auth-server-sdk/package.json
COPY --chown=bun:bun packages/auth-server-sdk/tsconfig.json packages/auth-server-sdk/tsconfig.json
COPY --chown=bun:bun packages/auth-server-sdk/eslint.config.cjs packages/auth-server-sdk/eslint.config.cjs

# @schemavaults/auth-ui
COPY --chown=bun:bun packages/auth-ui/package.json packages/auth-ui/package.json
COPY --chown=bun:bun packages/auth-ui/tsconfig.json packages/auth-ui/tsconfig.json
COPY --chown=bun:bun packages/auth-ui/eslint.config.cjs packages/auth-ui/eslint.config.cjs

# @schemavaults/jwt
COPY --chown=bun:bun packages/jwt/package.json packages/jwt/package.json
COPY --chown=bun:bun packages/jwt/tsconfig.json packages/jwt/tsconfig.json
COPY --chown=bun:bun packages/jwt/eslint.config.cjs packages/jwt/eslint.config.cjs

### Install packages
RUN bun install --frozen-lockfile

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

# @schemavaults/auth-server-sdk
COPY --chown=bun:bun packages/auth-server-sdk/src/ packages/auth-server-sdk/src/

# @schemavaults/auth-ui
COPY --chown=bun:bun packages/auth-ui/src/ packages/auth-ui/src/

# @schemavaults/jwt
COPY --chown=bun:bun packages/jwt/src/ packages/jwt/src/

### Build final server code ###
FROM source AS build

WORKDIR /schemavaults/auth
ENV NEXT_STANDALONE_DOCKER_BUILD true
ENV NEXT_TELEMETRY_DISABLED 1
RUN bun run build --filter @schemavaults/auth-server

FROM bunbase AS production

WORKDIR /schemavaults/auth
COPY --chown=bun:bun --from=build package.json package.json
COPY --chown=bun:bun --from=build bun.lock bun.lock
COPY --chown=bun:bun --from=build /schemavaults/auth/auth-server/package.json auth-server/package.json
COPY --chown=bun:bun --from=build /schemavaults/auth/auth-server/.next/ auth-server/.next/
COPY --chown=bun:bun --from=build /schemavaults/auth/auth-server/public/ auth-server/public/

RUN bun install --frozen-lockfile --production

WORKDIR /schemavaults/auth/auth-server
CMD [ "bun", "run", "start" ]
