#!/bin/bash

if ! command -v docker &> /dev/null
then
    echo "Error: docker is not installed" >&2
    exit 1
fi

if [ ! -f docker-compose.yml ]; then
    echo "Error: No docker-compose.yml file found? First, you may have to run: cd auth-postgres-db/" >&2
    exit 1
fi

docker compose up
