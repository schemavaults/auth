# @schemavaults/auth

Welcome to the monorepo for the [SchemaVaults Auth Platform](https://auth.schemavaults.com).

## Repository Structure

### The `packages` directory

- [@schemavaults/app-definitions](./packages/app-definitions)
- [@schemavaults/auth-client-sdk](./packages/auth-client-sdk)
- [@schemavaults/auth-common](./packages/auth-common)
- [@schemavaults/auth-react-provider](./packages/auth-react-provider)
- [@schemavaults/auth-server-sdk](./packages/auth-server-sdk)
- [@schemavaults/auth-ui](./packages/auth-ui)
- [@schemavaults/jwt](./packages/jwt)

### The `auth-server` application

In the [`auth-server`](./auth-server) directory is the code for the actual authentication/authorization server, which makes use of the packages in the [`packages`](./packages) directory.
