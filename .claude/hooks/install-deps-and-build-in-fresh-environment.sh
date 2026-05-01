#!/bin/bash
if [ ! -d "node_modules" ]; then
  echo "No node_modules/ folder appears to exist so we're going to install deps and build so types exist"
  bun install
  bun run build:packages
  bun run build:server
  bun run build --filter @schemavaults/cypress-e2e-auth-tests-helper-commands
fi
