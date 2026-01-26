#!/bin/bash
# Usage: /bin/bash ./migrate-db.sh {credentials_env_file}

set -e

# Check if bun is installed
if ! command -v bun &> /dev/null; then
  echo "Error: bun is not installed or not found in PATH"
  echo "Please install bun to continue"
  exit 1
fi

if [ ! -f ./src/lib/auth-db/migrate-to-latest.ts ]; then
  echo "Error: migrate-to-latest.ts not found"
  exit 1
fi

CREDENTIALS_ENV_FILE_PATH="$1"
if [ -z "$CREDENTIALS_ENV_FILE_PATH" ]; then
  echo "Error: credentials_env_file argument is not provided"
  exit 1
elif [ ! -f "$CREDENTIALS_ENV_FILE_PATH" ]; then
  echo "Error: credentials_env_file not found"
  exit 1
fi

source "$CREDENTIALS_ENV_FILE_PATH"

bun run ./src/lib/auth-db/migrate-to-latest.ts
