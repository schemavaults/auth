#!/bin/bash
# remove-auth-server-from-workspaces-definition.sh
# Used to remove the "./auth-server" from the 'workspaces' definitions
# useful in Docker builds for tests where we only need certain packages

set -e

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo "Error: jq is not installed or not found in PATH"
  echo "Please install jq to continue"
  exit 1
fi

# Remove the "./auth-server" from the 'workspaces' definitions in root package.json

MONOREPO_ROOT=$(pwd)
if [ -f ./remove-auth-server-from-workspaces-definition.sh ]; then
  MONOREPO_ROOT=$(dirname "$0")
fi

if [ ! -f "$MONOREPO_ROOT/package.json" ]; then
    echo "Error: Monorepo root package.json not found"
    exit 1
fi

# Throw if ./auth-server not in 'workspaces' array
if ! jq -e '.workspaces | index("./auth-server")' "$MONOREPO_ROOT/package.json" > /dev/null; then
    echo "Error: ./auth-server not found in 'workspaces' array"
    exit 1
fi

# Remove the "./auth-server" from the 'workspaces' definitions in root package.json
jq '.workspaces |= del(.[index("./auth-server")])' "$MONOREPO_ROOT/package.json" > "$MONOREPO_ROOT/package.json.tmp"
mv "$MONOREPO_ROOT/package.json.tmp" "$MONOREPO_ROOT/package.json"
