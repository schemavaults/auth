// Bun test preload — stubs out the `server-only` package so that modules
// guarded by `import "server-only"` can be imported from `bun test`. The
// runtime guard is purely a build-time signal for Next.js client/server
// boundary checking; in unit tests we always run on the server.
import { mock } from "bun:test";

mock.module("server-only", () => ({}));
