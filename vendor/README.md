# Vendored packages

Packages this repository uses before they are published to npm. Each one is the
exact tarball `bun pm pack` produces, so switching to the published package later
is a one-line change of the dependency's version range.

## `@schemavaults/sandbox-management-sdk`

| | |
| --- | --- |
| File | `schemavaults-sandbox-management-sdk-0.1.0.tgz` |
| Source | [schemavaults/sandbox-management-sdk](https://github.com/schemavaults/sandbox-management-sdk) at commit `327b16b` (`main`), version `0.1.0` |
| sha1 | `0d15bc06035565764e0eeb858b4d9a69bbb72296` |
| Used by | `tests/example-nextjs-resource-server` (the agent sessions example at `/agents`) |

Rebuild it from a checkout of the SDK (defaults to `../sandbox-management-sdk`), then
refresh the lockfile:

```bash
scripts/vendor-sandbox-management-sdk.sh ../sandbox-management-sdk
CYPRESS_INSTALL_BINARY=0 bun install
```

Once the SDK is on npm, replace the `file:` dependency in
`tests/example-nextjs-resource-server/package.json` with its version range, drop the
`COPY vendor/` line from `tests/example-nextjs-resource-server/Dockerfile`, and delete
the tarball, this section and the script.
