#!/bin/bash
# remove-auth-server-from-workspaces-definition.sh
# Used to remove the "./auth-server" from the 'workspaces' definitions
# useful in Docker builds for tests where we only need certain packages

set -e

# Detect available JSON tool
JSON_TOOL=""
if command -v jq &> /dev/null; then
  JSON_TOOL="jq"
elif command -v bun &> /dev/null; then
  JSON_TOOL="bun"
else
  echo "Error: Neither jq nor bun is installed or found in PATH"
  echo "Please install jq or bun to continue"
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

if [ "$JSON_TOOL" = "jq" ]; then
    # Throw if ./auth-server not in 'workspaces' array
    if ! jq -e '.workspaces | index("./auth-server")' "$MONOREPO_ROOT/package.json" > /dev/null; then
        echo "Error: ./auth-server not found in 'workspaces' array"
        exit 1
    fi

    # Remove the "./auth-server" from the 'workspaces' definitions in root package.json
    jq '.workspaces |= del(.[index("./auth-server")])' "$MONOREPO_ROOT/package.json" > "$MONOREPO_ROOT/package.json.tmp"
    mv "$MONOREPO_ROOT/package.json.tmp" "$MONOREPO_ROOT/package.json"
else
    # Use bun to read, validate, modify, and write back package.json
    bun -e "
const fs = require('fs');
const pkgPath = process.argv[1] + '/package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const idx = (pkg.workspaces || []).indexOf('./auth-server');
if (idx === -1) {
  console.error('Error: ./auth-server not found in workspaces array');
  process.exit(1);
}
pkg.workspaces.splice(idx, 1);
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
" "$MONOREPO_ROOT"
fi
