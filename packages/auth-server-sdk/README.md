# @schemavaults/auth-server-sdk

TypeScript SDK for SchemaVaults Auth Server and Resource Server API backends.

## CLI

```bash
bunx @schemavaults/auth-server-sdk codegen [options]
```

Generates the auth pages (`login`, `register`, `logout`, `authorize`, `error`)
and the `auth-provider.tsx` into your Next.js App Router project.

### Options

- `--client-output-dir <path>` — Custom output directory for the generated
  client `auth/` files. Defaults to `<app>/auth` (e.g. `src/app/auth` or
  `app/auth`). When set, the path is treated as the auth directory itself, so
  you can place the generated files inside a Next.js route group:

  ```bash
  bunx @schemavaults/auth-server-sdk codegen --client-output-dir src/app/\(client\)/auth
  ```

  Relative paths are resolved against the current working directory.
- `--templates-dir <path>` — Use a custom codegen templates directory instead
  of the templates bundled with the SDK.
- `--debug` — Enable debug logging.
- `--help`, `-h` — Show help.
- `--version`, `-v` — Show package name and version.

## Accepting resource-URL token audiences

Access tokens are normally minted with your API server id as their `aud`.
A client that requested its token with an RFC 8707 `resource` **URL** (MCP
clients do, and so do clients registered through RFC 7591 dynamic client
registration) receives a token whose `aud` is that URL instead. To accept
such tokens, list the URL(s) your server is known by:

```ts
new RouteGuardFactory({ environment, accepted_audiences: ["https://mcp.example.com/mcp"] });
// or, for the middleware:
new SchemaVaultsServerMiddleware({ ..., accepted_audiences: ["https://mcp.example.com/mcp"] });
```

Keysets are still looked up by the API server id; only the `aud` comparison
changes, and only for tokens whose header names one of the listed URLs
(`resolveExpectedTokenAudience()`). Tokens with any other `aud` fail as
before.
