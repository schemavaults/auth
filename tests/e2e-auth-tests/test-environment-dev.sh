#!/bin/bash
# test-environment-dev.sh
# Launches all the containers for the test environment (except for the actual Cypress test runner)
# Lets you connect to the test environment from your local browser to test it manually
# Add to /etc/hosts file:
# 127.0.0.1 schemavaults-auth
# Then from your browser you can connect to http://schemavaults-auth


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

docker compose \
  -f tests/e2e-auth-tests/docker-compose.yml \
  up \
  --abort-on-container-exit \
  --force-recreate \
  --build
