import type { IDecodeJWTsWithKeyManagerOutput } from "@schemavaults/auth-server-sdk";
import { describe, expect, test } from "bun:test";

describe("loadAuthContext", () => {
  test("should return null for user and orgs list when no auth headers are provided", async () => {
    const loadAuthContext = await import("./load_auth_context").then(
      (mod) => mod.default,
    );
    const result: IDecodeJWTsWithKeyManagerOutput = await loadAuthContext(null);
    expect(result).toBeTruthy();
    expect(result.user).toBeNull();
    try {
      // @ts-ignore
      expect(result.user_organizations).toBeFalsy();
    } catch (e: unknown) {}
  });
});
