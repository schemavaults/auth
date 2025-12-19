ARG POSTGRES_VERSION

FROM postgres:${POSTGRES_VERSION}

COPY auth-postgres-db/docker-entrypoint-initdb.d/ /docker-entrypoint-initdb.d/
