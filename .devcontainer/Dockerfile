# Dockerfile for @schemavaults/auth-server (development)


ARG BUN_VERSION
FROM oven/bun:${BUN_VERSION} AS bunbase

# Install additional tools if needed
RUN apt-get update && apt-get install -y git

# Set working directory
WORKDIR /workspace
