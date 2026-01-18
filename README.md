# @schemavaults/auth

Welcome to the monorepo for the [SchemaVaults Auth Platform](https://auth.schemavaults.com).

## Repository Structure

The auth platform code is within a [Turborepo](https://turborepo.com/) repository using Bun workspaces for package installation.

### The `packages` directory

- [@schemavaults/app-definitions](./packages/app-definitions)
- [@schemavaults/auth-client-sdk](./packages/auth-client-sdk)
- [@schemavaults/auth-common](./packages/auth-common)
- [@schemavaults/auth-react-provider](./packages/auth-react-provider)
- [@schemavaults/auth-server-sdk](./packages/auth-server-sdk)
- [@schemavaults/auth-ui](./packages/auth-ui)
- [@schemavaults/jwt](./packages/jwt)

### The `auth-server` application directory

In the [`auth-server`](./auth-server) directory is the code for the actual authentication/authorization server, which makes use of the packages in the [`packages`](./packages) directory.

### The `auth-postgres-db` directory

In the [`auth-postgres-db`](./auth-postgres-db) directory is utilities for launching/managing the dev/test versions of the Postgres database that `@schemavaults/auth-server` uses.

## Development

### Install dependencies
```bash
bun install
```

### Configure environment variables for `@schemavaults/auth-server`
```bash
bun run dev:init-env
```

### Start a Postgres container for `@schemavaults/auth-server` app to connect to
```bash
bun run dev:db
```

### Launch the development `@schemavaults/auth-server` Next.js app
```bash
bun run dev:server
```

## Production

### Build all packages
```bash
bun run build:packages
```

### Build auth server
```bash
bun run build:server
```
