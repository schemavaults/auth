# Single-VM Deployment (docker compose + nginx)

Host an instance of the SchemaVaults auth-server on a single VM with
`docker compose`, behind an nginx reverse proxy that serves the static
assets.

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
cp auth-server.env.example auth-server.env
# Fill in auth-server.env (database credentials, salts, MFA keys, URL)

SERVER_NAME=auth.example.com docker compose up --build -d
```

The stack exposes plain HTTP on port 80 (override with `NGINX_HTTP_PORT`).
Terminate TLS either in an external proxy/load balancer, or in the nginx
container itself (publish 443, mount certificates, and adapt the site config
template -- see the TLS notes in
`nginx/templates/auth-server.conf.template` and the commented block in
`docker-compose.yml`).

## Database

Postgres is not part of this stack. With
`SCHEMAVAULTS_APP_ENVIRONMENT=production` the server connects through the
Neon serverless driver over secure WebSockets to
`wss://${POSTGRES_HOST}/v2` (see
`auth-server/src/lib/auth-db/serverless-database.ts`). Point the
`POSTGRES_*` values in `auth-server.env` at a Neon-compatible hosted
Postgres endpoint that satisfies that contract.

Running Postgres on the same VM is possible but not turnkey: you would run
the `ghcr.io/schemavaults/dbh/postgres-ws-proxy` container in front of
Postgres (the pattern used by `tests/e2e-auth-tests/docker-compose.yml`)
and terminate TLS for it -- e.g. an additional nginx server block listening
with TLS on port 5433 that proxies `location /v2 { ... }` (WebSocket upgrade
headers included) to the ws-proxy's `/v1` endpoint, with
`POSTGRES_HOST=<your-domain>:5433`. The ws-proxy speaks plain WebSockets at
`/v1`, while the production driver dials `wss://.../v2`.

### Migrations

Run database migrations from a checkout of this repository against the same
database (the compiled migrations also ship in the image under
`/schemavaults/auth/auth-server/dist/migrations`):

```bash
cd auth-server
# .env.production must contain the same POSTGRES_* values as auth-server.env
bun run prod:migrate
```

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
