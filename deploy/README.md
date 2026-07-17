# Single-VM Deployment (docker compose + nginx)

Host an instance of the SchemaVaults auth-server on a single VM with
`docker compose`: nginx serves the static assets and reverse-proxies to the
auth-server, which connects directly to the bundled Postgres (no WebSocket
proxy) and Redis.

## Docker image targets

`auth-server/Dockerfile` provides these runtime targets:

| Target       | Contents                                                                   | Use case                                     |
| ------------ | -------------------------------------------------------------------------- | -------------------------------------------- |
| `staging`    | Standalone Next.js server + `.next/static/` + `public/`                     | Self-contained image, no reverse proxy needed |
| `production` | Standalone Next.js server + `public/` only (**no** `.next/static/`)         | Slim image behind the nginx static tier       |
| `nginx`      | nginx + `.next/static/` + `public/` + templated site config                 | Static tier / reverse proxy for `production`  |
| `test`       | Like `staging`, with `/api/test` routes retained                            | E2E test suite                                |

The `production` image intentionally 404s `/_next/static/` requests -- nginx
serves those from its own copy. `public/` stays in the server image because
the server reads `public/branding-defaults/` with the `fs` module (default
branding assets) and the `/_next/image` optimizer resolves public assets
(e.g. `/icon.png`) from the local `public/` directory.

## Quick start

```bash
cd deploy
cp .env.example .env
# Fill in .env (database credentials, salts, MFA keys, URL). docker compose
# reads it both for ${...} interpolation (the Postgres service's credentials)
# and as the auth-server container's env_file.

docker compose up --build -d

# First start only: apply the database migrations (see below), then restart
# the auth-server so it starts against the migrated schema:
docker compose restart schemavaults-auth
```

The stack exposes plain HTTP on port 80 (override with `NGINX_HTTP_PORT`).
Terminate TLS either in an external proxy/load balancer, or in the nginx
container itself (publish 443, mount certificates, and adapt the site config
template -- see the TLS notes in
`nginx/templates/auth-server.conf.template` and the commented block in
`docker-compose.yml`).

## Database

The stack includes a `postgres-db` service, initialized on first start from
the `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DATABASE` values in
`deploy/.env` and persisted in the `postgres-data` volume. The auth-server
connects to it directly over TCP: the stack sets
`SCHEMAVAULTS_DBH_ADAPTER=postgres`, which selects `@schemavaults/dbh`'s
`SchemaVaultsPostgresAdapter` (a plain `pg` Pool) instead of the default
`postgres-neon-proxy` adapter (`SchemaVaultsPostgresNeonProxyAdapter`, which
dials a Neon-compatible WebSocket proxy at `wss://${POSTGRES_HOST}/v2` in the
production app environment).

To use an external Neon-compatible serverless Postgres instead of the bundled
database, set `SCHEMAVAULTS_DBH_ADAPTER=postgres-neon-proxy` in `deploy/.env`,
point the `POSTGRES_*` values at the hosted endpoint, and remove the
`postgres-db` service (and the auth-server's `depends_on` entry for it) from
the compose file.

### Migrations

The `dbh migrate` CLI behind the auth-server's `dev:migrate` / `prod:migrate`
scripts connects through the Neon WebSocket proxy, which this stack does not
run. Apply migrations with `auth-server/migrate-database-direct.ts` instead,
which uses the same direct-TCP adapter as the server. The compose file
publishes Postgres on `127.0.0.1:5432` (loopback only) for exactly this
purpose.

From a checkout of this repository on the VM:

```bash
bun install
(cd auth-server && bun run build:migrations)
POSTGRES_HOST=127.0.0.1 bun --env-file=deploy/.env auth-server/migrate-database-direct.ts
```

(`POSTGRES_HOST` is overridden because `deploy/.env` points at the compose
network hostname `postgres-db`, which does not resolve on the VM itself.)

Re-run after every upgrade that ships new migrations.

## Host-level nginx instead of the nginx container

To use an nginx installed on the VM itself (e.g. managed by certbot) instead
of the `nginx` service:

1. Remove the `nginx` service and publish the auth-server port instead,
   e.g. `127.0.0.1:3000:80`.
2. Extract the static assets from the built `nginx` target image:

   ```bash
   docker compose build nginx
   docker create --name auth-static schemavaults/auth-server-nginx:local
   docker cp auth-static:/usr/share/nginx/html/. /var/www/schemavaults-auth/
   docker rm auth-static
   ```

   Re-extract after every image rebuild -- the `/_next/static/` contents are
   content-hashed per build.

3. Generate the site config:

   ```bash
   ./nginx/generate-nginx-site-config.sh \
     --server-name auth.example.com \
     --upstream 127.0.0.1:3000 \
     --static-root /var/www/schemavaults-auth \
     --output /etc/nginx/sites-available/schemavaults-auth.conf
   ln -s /etc/nginx/sites-available/schemavaults-auth.conf /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```

## Self-contained alternative (no nginx)

Build the `staging` target instead of `production` + `nginx`: it includes
`.next/static/` and `public/`, so the Node server serves everything itself.
