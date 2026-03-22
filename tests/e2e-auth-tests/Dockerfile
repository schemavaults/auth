# Dockerfile for @schemavaults/e2e-auth-tests

ARG BUN_VERSION
FROM oven/bun:${BUN_VERSION} AS bunbase

### Update/Install Additional Tools ###
RUN apt-get update
RUN apt-get install -y git
RUN apt-get install -y libgtk-3-0 libgbm-dev libnotify-dev libnss3 libxss1 libasound2 libxtst6 xauth xvfb
RUN apt-get install -y unzip
RUN apt-get install -y jq

FROM bunbase AS deps

# Set working directory
WORKDIR /schemavaults/auth

# Copy root workspace files
COPY package.json package.json
COPY bun.lock bun.lock

# Copy helper script for removing "./auth-server" from 'workspaces' definitions
COPY scripts/remove-auth-server-from-workspaces-definition.sh scripts/remove-auth-server-from-workspaces-definition.sh

# Set permissions for the helper script
RUN chmod +x scripts/remove-auth-server-from-workspaces-definition.sh
RUN /bin/bash ./scripts/remove-auth-server-from-workspaces-definition.sh

# Copy package sources for building
COPY packages/app-definitions/package.json packages/app-definitions/package.json
COPY packages/app-definitions/src packages/app-definitions/src
COPY packages/app-definitions/tsconfig.json packages/app-definitions/tsconfig.json

COPY packages/auth-common/package.json packages/auth-common/package.json
COPY packages/auth-common/src packages/auth-common/src
COPY packages/auth-common/tsconfig.json packages/auth-common/tsconfig.json

COPY packages/jwt/package.json packages/jwt/package.json
COPY packages/jwt/src packages/jwt/src
COPY packages/jwt/tsconfig.json packages/jwt/tsconfig.json

COPY tests/cypress-e2e-auth-tests-helper-commands/package.json tests/cypress-e2e-auth-tests-helper-commands/package.json
COPY tests/cypress-e2e-auth-tests-helper-commands/src tests/cypress-e2e-auth-tests-helper-commands/src
COPY tests/cypress-e2e-auth-tests-helper-commands/tsconfig.json tests/cypress-e2e-auth-tests-helper-commands/tsconfig.json

COPY tests/e2e-auth-tests/package.json tests/e2e-auth-tests/package.json

# Install all workspace dependencies
RUN bun install

# Build packages in dependency order
WORKDIR /schemavaults/auth/packages/app-definitions
RUN bun run build

WORKDIR /schemavaults/auth/packages/auth-common
RUN bun run build

WORKDIR /schemavaults/auth/packages/jwt
RUN bun run build

WORKDIR /schemavaults/auth/tests/cypress-e2e-auth-tests-helper-commands
RUN bun run build

# Install Cypress
WORKDIR /schemavaults/auth/tests/e2e-auth-tests
RUN bun run cy:install

FROM deps AS test-runner

WORKDIR /schemavaults/auth/tests/e2e-auth-tests
COPY tests/e2e-auth-tests/cypress.config.ts cypress.config.ts
COPY tests/e2e-auth-tests/tsconfig.json tsconfig.json
COPY tests/e2e-auth-tests/cypress/e2e/ cypress/e2e/
COPY tests/e2e-auth-tests/cypress/fixtures/ cypress/fixtures/
COPY tests/e2e-auth-tests/cypress/support/ cypress/support/

CMD [ "bun", "run", "e2e" ]
