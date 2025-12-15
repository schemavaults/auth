# Dockerfile for @schemavaults/e2e-auth-tests


ARG BUN_VERSION
FROM oven/bun:${BUN_VERSION} AS bunbase

# Install additional tools if needed
RUN apt-get update && apt-get install -y git

FROM bunbase AS deps

# Set working directory
WORKDIR /schemavaults/auth

COPY package.json package.json
COPY bun.lock bun.lock
COPY tests/e2e-auth-tests/package.json tests/e2e-auth-tests/package.json

RUN bun install

FROM deps as test-runner

WORKDIR /schemavaults/auth

CMD [ "bun", "run", "e2e" ]
