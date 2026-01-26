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
The [`auth-postgres-db`](./auth-postgres-db) directory contains utilities for launching/managing the dev/test versions of the Postgres database that `@schemavaults/auth-server` uses.

## Development
See the [@schemavaults/auth-server README.md](./auth-server/README.md) for instructions on how to start the development server.

## Production
**[https://auth.schemavaults.com](https://auth.schemavaults.com)**

### Building packages
Build all packages:
```bash
bun run build:packages
```

Build a specific package:
```bash
bun run build --filter @schemavaults/auth-server-sdk
```

### Build auth server
See the [@schemavaults/auth-server README.md](./auth-server/README.md) for build instructions.
