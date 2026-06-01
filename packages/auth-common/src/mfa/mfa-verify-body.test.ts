import { describe, test, expect } from "bun:test";
import { mfaVerifyBodySchema } from "./mfa-verify-body";

const CHALLENGE_ID = "11111111-1111-4111-8111-111111111111";
const FACTOR_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_APP_ID = "schemavaults-auth";

describe("mfaVerifyBodySchema", () => {
  test("accepts a TOTP proof with factor_id", () => {
    const body = {
      challenge_id: CHALLENGE_ID,
      client_app_id: CLIENT_APP_ID,
      proof: {
        type: "totp" as const,
        factor_id: FACTOR_ID,
        code: "123456",
      },
    };
    expect(mfaVerifyBodySchema.safeParse(body).success).toBe(true);
  });

  test("rejects a TOTP proof missing factor_id", () => {
    const body = {
      challenge_id: CHALLENGE_ID,
      client_app_id: CLIENT_APP_ID,
      proof: { type: "totp" as const, code: "123456" },
    };
    expect(mfaVerifyBodySchema.safeParse(body).success).toBe(false);
  });

  test("accepts a recovery_code proof (no factor_id required)", () => {
    const body = {
      challenge_id: CHALLENGE_ID,
      client_app_id: CLIENT_APP_ID,
      proof: {
        type: "recovery_code" as const,
        recovery_code: "abcde-fghij",
      },
    };
    expect(mfaVerifyBodySchema.safeParse(body).success).toBe(true);
  });

  test("accepts a webauthn proof with factor_id and assertion", () => {
    const body = {
      challenge_id: CHALLENGE_ID,
      client_app_id: CLIENT_APP_ID,
      proof: {
        type: "webauthn" as const,
        factor_id: FACTOR_ID,
        assertion: {
          id: "credential-id",
          rawId: "credential-id",
          response: {
            clientDataJSON: "x",
            authenticatorData: "y",
            signature: "z",
          },
          type: "public-key",
        },
      },
    };
    expect(mfaVerifyBodySchema.safeParse(body).success).toBe(true);
  });

  test("rejects a webauthn proof missing the assertion", () => {
    const body = {
      challenge_id: CHALLENGE_ID,
      client_app_id: CLIENT_APP_ID,
      proof: { type: "webauthn" as const, factor_id: FACTOR_ID },
    };
    expect(mfaVerifyBodySchema.safeParse(body).success).toBe(false);
  });
});
