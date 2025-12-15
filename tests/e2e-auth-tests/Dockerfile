# Dockerfile for @schemavaults/e2e-auth-tests


ARG BUN_VERSION
FROM oven/bun:${BUN_VERSION} AS bunbase

### Update/Install Additional Tools ###
RUN apt-get update
RUN apt-get install -y git
RUN apt-get install -y libgtk-3-0 libgbm-dev libnotify-dev libnss3 libxss1 libasound2 libxtst6 xauth xvfb
RUN apt-get install -y unzip

FROM bunbase AS deps

# Set working directory
WORKDIR /schemavaults/auth

COPY tests/e2e-auth-tests/package.json tests/e2e-auth-tests/package.json

WORKDIR /schemavaults/auth/tests/e2e-auth-tests
RUN bun install
RUN bun run cy:install

FROM deps as test-runner

WORKDIR /schemavaults/auth/tests/e2e-auth-tests

CMD [ "bun", "run", "e2e" ]
