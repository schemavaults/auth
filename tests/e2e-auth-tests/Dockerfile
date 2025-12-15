# Dockerfile for @schemavaults/e2e-auth-tests


ARG BUN_VERSION
FROM oven/bun:${BUN_VERSION} AS bunbase

# Install additional tools if needed
RUN apt-get update && apt-get install -y git libgtk-3-0t64 libgbm-dev libnotify-dev libnss3 libxss1 libasound2t64 libxtst6 xauth xvfb

FROM bunbase AS deps

# Set working directory
WORKDIR /schemavaults/auth

COPY tests/e2e-auth-tests/package.json tests/e2e-auth-tests/package.json

WORKDIR /schemavaults/auth/tests/e2e-auth-tests
RUN bun install
WORKDIR /schemavaults/auth

FROM deps as test-runner

WORKDIR /schemavaults/auth/tests/e2e-auth-tests

CMD [ "bun", "run", "e2e" ]
