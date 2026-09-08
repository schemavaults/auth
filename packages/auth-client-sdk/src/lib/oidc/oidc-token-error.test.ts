import { describe, expect, test } from "bun:test";
import * as oidc from "openid-client";
import { classifyOidcTokenError } from "./oidc-token-error";

async function responseBodyError(
  status: number,
  body: Record<string, unknown>,
): Promise<oidc.ResponseBodyError> {
  // Drive openid-client's own error construction so the test exercises
  // the real class rather than a hand-built lookalike.
  const config = new oidc.Configuration(
    {
      issuer: "https://auth.example.com",
      token_endpoint: "https://auth.example.com/api/oidc/token",
    },
    "my-app",
    { token_endpoint_auth_method: "none" },
    oidc.None(),
  );
  config[oidc.customFetch] = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  try {
    await oidc.refreshTokenGrant(config, "refresh.jwt");
  } catch (e: unknown) {
    if (e instanceof oidc.ResponseBodyError) return e;
    throw e;
  }
  throw new Error("expected refreshTokenGrant to fail");
}

describe("classifyOidcTokenError", () => {
  test("invalid_grant means the session is lost", async () => {
    const classified = classifyOidcTokenError(
      await responseBodyError(400, {
        error: "invalid_grant",
        error_description: "Refresh token has been revoked.",
      }),
    );
    expect(classified.error).toBe("invalid_grant");
    expect(classified.status).toBe(400);
    expect(classified.session_lost).toBe(true);
    expect(classified.message).toContain("Refresh token has been revoked.");
  });

  test("invalid_target keeps the session", async () => {
    const classified = classifyOidcTokenError(
      await responseBodyError(400, {
        error: "invalid_target",
        error_description: "Unknown resource.",
      }),
    );
    expect(classified.error).toBe("invalid_target");
    expect(classified.session_lost).toBe(false);
  });

  test("plain errors and non-errors are classified as recoverable", () => {
    expect(classifyOidcTokenError(new Error("network down"))).toMatchObject({
      error: null,
      status: null,
      session_lost: false,
      message: "network down",
    });
    expect(classifyOidcTokenError("???").session_lost).toBe(false);
  });
});
