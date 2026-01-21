#!/bin/bash

if ! command -v psql &> /dev/null
then
    echo "Error: psql is not installed" >&2
    exit 1
fi

PGPASSWORD="schemavaults-auth-server-dev" psql -U schemavaults-auth-server-dev -h localhost -p 5432 -d schemavaults-auth-server-dev
