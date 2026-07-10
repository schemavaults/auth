// TypeScript 7 compatibility shim for ESLint — require()'d as the first line
// of every eslint.config.cjs in this monorepo.
//
// typescript@7 is the native (Go-based) compiler: its npm package no longer
// ships the JavaScript compiler API (`require("typescript")` only exposes the
// version string). @typescript-eslint (and eslint-config-next's copy of it)
// still needs that API and does not support TypeScript 7 yet — its peer range
// caps at <6.1.0. Bun also cannot scope a different `typescript` version to
// the lint toolchain (nested overrides/resolutions are unsupported), so the
// workspaces' typescript@7.0.2 devDependency is what typescript-eslint would
// otherwise load, crashing at import time.
//
// This shim redirects any `require("typescript")` (and subpaths) made while
// linting to the JS-based compiler installed as the root devDependency
// "typescript-jsapi" (npm:typescript@5.9.3 — the same version lint ran on
// before the TypeScript 7 upgrade, so lint behavior is unchanged). It only
// affects processes that load an eslint config; tsc, next build, and package
// builds never execute this file.
//
// Delete this file (and the "typescript-jsapi" root devDependency, and the
// require lines in each eslint.config.cjs) once typescript-eslint supports
// TypeScript 7.

if (!global.__schemavaultsEslintTsCompatInstalled) {
  global.__schemavaultsEslintTsCompatInstalled = true;

  const Module = require("module");

  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === "typescript" || request.startsWith("typescript/")) {
      const redirected = "typescript-jsapi" + request.slice("typescript".length);
      // Resolve from this file's location (the repo root) so the root-level
      // alias is found regardless of which package initiated the require.
      return originalResolveFilename.call(this, redirected, module, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}
