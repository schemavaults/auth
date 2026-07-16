import { describe, it, expect } from "bun:test";
import {
  customJwtPayloadToUserData,
  getScopeFromCustomJwtPayload,
} from "./custom-jwt-payload-to-user-data";
import type { CustomJWTPayload } from "./payload_data";

describe("customJwtPayloadToUserData", () => {
  const uid = crypto.randomUUID();

  const fullPayload: CustomJWTPayload = {
    uid,
    sub: uid,
    email: "test@example.com",
    email_verified: true,
    admin: false,
    disabled: false,
    created_at: Date.now(),
    aud: "https://auth.schemavaults.com",
    app: "https://auth.schemavaults.com",
    sig: "a".repeat(64),
    iss: "schemavaults-auth",
    env: "test",
    iat: Math.floor(Date.now() / 1000),
  };

  it("should extract only UserData fields from a CustomJWTPayload", () => {
    const result = customJwtPayloadToUserData(fullPayload);

    expect(result).toEqual({
      uid: fullPayload.uid,
      sub: fullPayload.sub,
      email: fullPayload.email,
      email_verified: fullPayload.email_verified,
      admin: fullPayload.admin,
      disabled: fullPayload.disabled,
      created_at: fullPayload.created_at,
    });
  });

  it("should not include JWT-specific fields (aud, app, sig, iss, env)", () => {
    const result = customJwtPayloadToUserData(fullPayload);

    expect(result).not.toHaveProperty("aud");
    expect(result).not.toHaveProperty("app");
    expect(result).not.toHaveProperty("sig");
    expect(result).not.toHaveProperty("iss");
    expect(result).not.toHaveProperty("env");
  });

  it("should produce output that passes userDataSchema strict validation", async () => {
    const { userDataSchema } = await import("@schemavaults/auth-common");
    const result = customJwtPayloadToUserData(fullPayload);
    const parsed = await userDataSchema.safeParseAsync(result);

    expect(parsed.success).toBe(true);
  });

  it("should fail userDataSchema validation when using raw CustomJWTPayload", async () => {
    const { userDataSchema } = await import("@schemavaults/auth-common");
    const parsed = await userDataSchema.safeParseAsync(fullPayload);

    expect(parsed.success).toBe(false);
  });

  it("should NOT fold the token's scope claim into UserData", async () => {
    const { userDataSchema } = await import("@schemavaults/auth-common");

    // Scope is threaded alongside the user, never inside it — even when the
    // token carries a scope claim, the mapped UserData omits it.
    const userData = customJwtPayloadToUserData({
      ...fullPayload,
      scope: "openid email profile",
    });
    expect(userData).not.toHaveProperty("scope");
    expect((await userDataSchema.safeParseAsync(userData)).success).toBe(true);
  });

  describe("getScopeFromCustomJwtPayload", () => {
    it("returns the token's granted scope claim", () => {
      expect(
        getScopeFromCustomJwtPayload({
          ...fullPayload,
          scope: "openid email profile",
        }),
      ).toBe("openid email profile");
    });

    it("returns null when the token has no scope claim", () => {
      expect(getScopeFromCustomJwtPayload(fullPayload)).toBeNull();
    });

    it("returns null for an empty scope claim", () => {
      expect(
        getScopeFromCustomJwtPayload({ ...fullPayload, scope: "" }),
      ).toBeNull();
    });
  });
});
