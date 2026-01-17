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

### First time setup

There is a helper script `init-dev-env.ts` that will generate the `.env.development` file for you. You can run `bun run dev:init-env` from the monorepo root.

### Launch services

```bash
# From the monorepo root:
# Launch the database
bun run dev:db
# Launch the auth server
bun run dev:server
```

## Build as a standalone Docker container (for E2E testing offline)

```bash
# From the monorepo root
# cd ~/schemavaults
docker build \
    -t schemavaults/auth-server:latest \
    -f ./apps/auth-server/Dockerfile \
    .
```
