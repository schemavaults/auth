import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const DOMAINS = [
  "admin",
  "apps",
  "apis",
  "organizations",
  "account",
  "authentication",
  "oidc",
  "mfa",
  "resource-servers",
  "configuration",
  "test-environment",
] as const;

/**
 * zod v4 copies `ZodType.prototype` methods onto each schema when it is
 * constructed, so `.openapi()` (installed by @schemavaults/openapi-operations)
 * is missing on schemas that @schemavaults/auth-common / app-definitions
 * built before that package was evaluated. Which package a bundle evaluates
 * first is an accident of import order, so every operation module must use
 * `withOpenApi()` for schemas it did not build itself. This test loads the
 * foreign schema packages FIRST, then every domain catalogue in isolation:
 * a direct `.openapi()` call on a foreign schema throws here.
 */
describe("operation catalogues load whatever evaluates first", () => {
  test("auth-common and app-definitions first, then each domain", async () => {
    await import("@schemavaults/auth-common");
    await import("@schemavaults/app-definitions");
    for (const domain of DOMAINS) {
      const loaded = (await import(`./operations/${domain}`)) as Record<string, unknown>;
      const [list] = Object.values(loaded);
      expect(Array.isArray(list), `${domain} exports its operation list`).toBe(true);
      expect((list as unknown[]).length, `${domain} is not empty`).toBeGreaterThan(0);
    }
  });
});
