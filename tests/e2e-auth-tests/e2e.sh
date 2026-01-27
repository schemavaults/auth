#!/bin/bash
# e2e.sh
# Launches the containerized auth server and the Cypress test runner

VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if ! command -v docker &> /dev/null
then
    echo "Error: docker is not installed" >&2
    exit 1
fi

if [ ! -f docker-compose.yml ]; then
    echo "Error: docker-compose.yml for test environment not found!" >&2
    exit 1
fi

MONOREPO_ROOT="$(pwd)/../.."
cd $MONOREPO_ROOT

if [ ! -f package.json ]; then
    echo "Error: Failed to resolve package.json in monorepo root!" >&2
    exit 1
fi

ATTACH_FLAG="--attach schemavaults-e2e-auth-tests"
if [ "$VERBOSE" = true ]; then
    ATTACH_FLAG=""
fi

docker compose \
  -f tests/e2e-auth-tests/docker-compose.yml \
  --profile e2e \
  up \
  --exit-code-from schemavaults-e2e-auth-tests \
  --abort-on-container-exit \
  --build \
  --force-recreate \
  $ATTACH_FLAG
