#!/bin/bash
# Usage: /bin/bash ./migrate-db.sh {credentials_env_file}

set -e

# Check if bun is installed
if ! command -v bun &> /dev/null; then
  echo "Error: bun is not installed or not found in PATH"
  echo "Please install bun to continue"
  exit 1
fi

AUTH_SERVER_DIRECTORY=$(pwd)
if [ -d ./auth-server ]; then
  AUTH_SERVER_DIRECTORY="$AUTH_SERVER_DIRECTORY/auth-server"
fi

if [ ! -f $AUTH_SERVER_DIRECTORY/src/lib/auth-db/migrate-to-latest.ts ]; then
  echo "Error: migrate-to-latest.ts not found"
  exit 1
fi

# Prepare migrations
bun run build:migrations

# Load database credentials
CREDENTIALS_ENV_FILE_PATH="$1"
if [ -z "$CREDENTIALS_ENV_FILE_PATH" ]; then
  echo "Error: credentials_env_file argument is not provided"
  exit 1
elif [ ! -f "$CREDENTIALS_ENV_FILE_PATH" ]; then
  echo "Error: credentials_env_file not found"
  exit 1
fi
source "$CREDENTIALS_ENV_FILE_PATH"

MIGRATIONS_PATH="$AUTH_SERVER_DIRECTORY/dist/migrations"

MIGRATION_SCRIPT_PATH="$AUTH_SERVER_DIRECTORY/src/lib/auth-db/migrate-to-latest.ts"

echo "Running migrations at \"$MIGRATIONS_PATH\"..."

# Run the migrations
MIGRATIONS_PATH=$MIGRATIONS_PATH bun run $MIGRATION_SCRIPT_PATH

echo "Finished running migrations!"
