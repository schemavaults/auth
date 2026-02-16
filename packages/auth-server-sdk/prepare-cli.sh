#!/bin/bash
# prepare-cli.sh
# Prepends a Node.js shebang to ./dist/cli.cjs and makes it executable.
# tsc strips shebangs from compiled output, so this is needed for bin usage.

set -e

# Check if bun is installed
if ! command -v bun &> /dev/null; then
  echo "Error: bun is not installed or not found in PATH"
  echo "Please install bun to continue"
  exit 1
fi

DIR_NAME=$(basename "$(pwd)")

if [ "$DIR_NAME" != "auth-server-sdk" ]; then
    echo "Error: This script must be run from the auth-server-sdk directory" >&2
    exit 1
fi

CLI_FILE="./dist/cli.cjs"

if [ -f "$CLI_FILE" ]; then
    echo "Warning: $CLI_FILE already exists. Deleting it!" >&2
    rm "$CLI_FILE"
fi

bun run build-cli-for-nodejs

if [ ! -f "$CLI_FILE" ]; then
    echo "Error: $CLI_FILE not found. The build should run successfully before preparing the CLI." >&2
    exit 1
fi

# Prepend shebang if not already present
if ! head -1 "$CLI_FILE" | grep -q '^#!/'; then
    TEMP_FILE=$(mktemp)
    echo '#!/usr/bin/env node' | cat - "$CLI_FILE" > "$TEMP_FILE"
    mv "$TEMP_FILE" "$CLI_FILE"
fi

chmod +x "$CLI_FILE"

echo "[prepare-cli.sh] Successfully prepared $CLI_FILE with shebang and executable permission."
