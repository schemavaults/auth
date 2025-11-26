# Dockerfile for @schemavaults/auth-server

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
COPY --chown=bun:bun auth-server/next-env.d.ts auth-server/next-env.d.ts


### Supporting Auth Packages ###

# @schemavaults/app-definitions
COPY --chown=bun:bun packages/app-definitions/package.json packages/app-definitions/package.json
COPY --chown=bun:bun packages/app-definitions/tsconfig.json packages/app-definitions/tsconfig.json

# @schemavaults/auth-client-sdk
COPY --chown=bun:bun packages/auth-client-sdk/package.json packages/auth-client-sdk/package.json
COPY --chown=bun:bun packages/auth-client-sdk/tsconfig.json packages/auth-client-sdk/tsconfig.json


# @schemavaults/auth-common
COPY --chown=bun:bun packages/auth-common/package.json packages/auth-common/package.json
COPY --chown=bun:bun packages/auth-common/tsconfig.json packages/auth-common/tsconfig.json


# @schemavaults/auth-react-provider
COPY --chown=bun:bun packages/auth-react-provider/package.json packages/auth-react-provider/package.json
COPY --chown=bun:bun packages/auth-react-provider/tsconfig.json packages/auth-react-provider/tsconfig.json

# @schemavaults/auth-server-sdk
COPY --chown=bun:bun packages/auth-server-sdk/package.json packages/auth-server-sdk/package.json
COPY --chown=bun:bun packages/auth-server-sdk/tsconfig.json packages/auth-server-sdk/tsconfig.json

# @schemavaults/auth-ui
COPY --chown=bun:bun packages/auth-ui/package.json packages/auth-ui/package.json
COPY --chown=bun:bun packages/auth-ui/tsconfig.json packages/auth-ui/tsconfig.json

# @schemavaults/jwt
COPY --chown=bun:bun packages/jwt/package.json packages/jwt/package.json
COPY --chown=bun:bun packages/jwt/tsconfig.json packages/jwt/tsconfig.json

### Install packages
RUN bun install --frozen-lockfile

FROM deps AS development

WORKDIR /schemavaults/auth
CMD [ "bun", "run", "dev", "--filter", "@schemavaults/auth-server" ]
