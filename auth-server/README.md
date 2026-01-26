# @schemavaults/auth-server

Authentication backend for SchemaVaults applications. Deployed in production as `auth.schemavaults.com`.

## Interacting with @schemavaults/auth-server

See the [`@schemavaults/auth-client-sdk`](../packages/auth-client-sdk/) and [`@schemavaults/auth-react-provider`](../packages/auth-react-provider/) packages for authenticating against this authentication server.

## Dependencies

- Core authentication tools (e.g. hashing, JWT, etc.) from [`@schemavaults/auth`](../packages/auth/)
- React.js/Next.js Provider for making the auth server's frontend use the same auth client SDK that a 3rd party app would use: [`@schemavaults/auth-react-provider](../packages/auth-react-provider/)
- Shared UI code from [`@schemavaults/ui`](../packages/ui/)
- [kysely](https://www.kysely.dev/), [kysely-neon](https://github.com/seveibar/kysely-neon), [@neondatabase/serverless](https://neon.tech/docs/serverless/serverless-driver), to allow connecting to Postgres from the edge (or locally)

## Development

### First-Time Setup

#### 1. Install Dependencies

You will need some staples:
- [Bun](https://bun.sh/)
- [Docker](https://www.docker.com/products/docker-desktop)

Install the necessary dependencies for all packages and the auth server by running:
```bash
bun install
```

#### 2. Configure Environment Variables

There is a helper script `init-dev-env.ts` that will generate the `.env.development` file for you, prompting you for environment variables. Run it from the monorepo root:
```bash
bun run dev:init-env
```

#### 3. Configure Database

You'll need to launch the database and run migrations in order for the server to properly read/write data:

```bash
# From the monorepo root:
# Launch the database
bun run dev:db
# In a separate terminal, run migrations while the database is running
bun run dev:migrate
```

### Launch dev services

#### 1. Launch development database
```bash
# From the monorepo root:
# Launch the database
bun run dev:db
```

#### 2. Launch development auth server
```bash
# From the monorepo root:
# Launch the auth server
bun run dev:server
```

#### 3. Connect to local development auth server

By default the development auth server will run at [http://localhost:6767](http://localhost:6767).

## Production / Build

### Production

**[https://auth.schemavaults.com](https://auth.schemavaults.com)**


### Build as a standalone Docker container (for E2E testing offline)

```bash
# From the monorepo root
docker build \
    -t schemavaults/auth-server:latest \
    -f ./auth-server/Dockerfile \
    .
```
