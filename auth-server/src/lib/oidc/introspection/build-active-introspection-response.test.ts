import { describe, expect, test } from "bun:test";
import { accessTokenExpiry, refreshTokenExpiry } from "@schemavaults/auth-common";
import type { CustomJWTPayload } from "@schemavaults/jwt";
import { buildActiveIntrospectionResponse } from "./build-active-introspection-response";
import type { IntrospectableTokenKind } from "./types";

const UID = "4f7c2f4e-9d6a-4a1b-8f3e-2c5d6e7f8a9b" as const;
const CLIENT_APP_ID = "22222222-2222-4222-8222-222222222222" as const;
const JTI = "33333333-3333-4333-8333-333333333333" as const;
const ACTOR_UID = "44444444-4444-4444-8444-444444444444" as const;
const PRIOR_ACTOR_UID = "55555555-5555-4555-8555-555555555555" as const;
const FIRST_ACTOR_UID = "66666666-6666-4666-8666-666666666666" as const;
const ISSUER = "https://auth.example.com" as const;
const IAT = 1_700_000_000;

const PAYLOAD: CustomJWTPayload = {
  uid: UID,
  sub: UID,
  email: "user@example.com",
  email_verified: true,
  aud: "11111111-1111-4111-8111-111111111111",
  app: CLIENT_APP_ID,
  admin: false,
  disabled: false,
  created_at: 1_600_000_000_000,
  sig: "s".repeat(64),
  iss: ISSUER,
  env: "test",
  iat: IAT,
};

function build(
  kind: IntrospectableTokenKind,
  payload: Partial<CustomJWTPayload> = {},
) {
  return buildActiveIntrospectionResponse({
    token: { kind, payload: { ...PAYLOAD, ...payload } },
    auth_server_app_id: "acme-auth",
    issuer: ISSUER,
  });
}

describe("buildActiveIntrospectionResponse", () => {
  test("reports the token's metadata, with the OIDC `sub` and the bare `uid`", () => {
    expect(build("access", { scope: "openid email", jti: JTI })).toEqual({
      active: true,
      scope: "openid email",
      client_id: CLIENT_APP_ID,
      username: "user@example.com",
      token_type: "Bearer",
      exp: IAT + accessTokenExpiry,
      iat: IAT,
      sub: `acme-auth|${UID}`,
      uid: UID,
      aud: PAYLOAD.aud,
      iss: ISSUER,
      jti: JTI,
    });
  });

  test("reports the token's own `exp`", () => {
    expect(build("access", { exp: IAT + accessTokenExpiry }).exp).toBe(IAT + accessTokenExpiry);
    expect(build("refresh", { exp: IAT + refreshTokenExpiry }).exp).toBe(IAT + refreshTokenExpiry);
  });

  test("reports the earlier `exp` of a token that expires before its kind's validity (a delegated token)", () => {
    const exp: number = IAT + 600;
    expect(build("access", { exp, act: { sub: ACTOR_UID, client_id: CLIENT_APP_ID } }).exp).toBe(exp);
  });

  test("reconstructs `exp` from the token kind's validity when the payload has none", () => {
    expect(build("access").exp).toBe(IAT + accessTokenExpiry);
    expect(build("refresh").exp).toBe(IAT + refreshTokenExpiry);
  });

  test("reports `token_type` for access tokens only", () => {
    expect(build("access").token_type).toBe("Bearer");
    expect(build("refresh")).not.toHaveProperty("token_type");
  });

  test("reports the API scopes an access token carries alongside its OIDC scopes", () => {
    expect(build("access", { scope: "openid notes:read email notes:write" }).scope).toBe(
      "openid notes:read email notes:write",
    );
    expect(build("access", { scope: "notes:read" }).scope).toBe("notes:read");
  });

  test("omits `scope` for a plain OAuth 2.1 grant", () => {
    expect(build("access")).not.toHaveProperty("scope");
  });

  test("reports `username` only when the email scope was granted", () => {
    expect(build("access", { scope: "openid profile" })).not.toHaveProperty(
      "username",
    );
    expect(build("access", { scope: "email" }).username).toBe(
      "user@example.com",
    );
  });

  test("omits `jti` when the token has none", () => {
    expect(build("access")).not.toHaveProperty("jti");
  });

  test("flags a service account's token, and only that", () => {
    expect(build("access", { service_account: true }).service_account).toBe(true);
    expect(build("access")).not.toHaveProperty("service_account");
    expect(build("access", { service_account: false })).not.toHaveProperty(
      "service_account",
    );
  });

  test("reports a delegated token's actor like its subject: OIDC `sub` plus `uid`", () => {
    expect(
      build("access", { act: { sub: ACTOR_UID, client_id: CLIENT_APP_ID } }).act,
    ).toEqual({
      sub: `acme-auth|${ACTOR_UID}`,
      uid: ACTOR_UID,
      client_id: CLIENT_APP_ID,
    });
    // The subject stays the user: the actor never replaces `sub` / `uid`.
    const response = build("access", { act: { sub: ACTOR_UID } });
    expect(response.sub).toBe(`acme-auth|${UID}`);
    expect(response.uid).toBe(UID);
    expect(response.act).toEqual({ sub: `acme-auth|${ACTOR_UID}`, uid: ACTOR_UID });
  });

  test("keeps a delegation chain's prior actors nested, current actor outermost", () => {
    expect(
      build("access", {
        act: {
          sub: ACTOR_UID,
          client_id: CLIENT_APP_ID,
          act: { sub: PRIOR_ACTOR_UID, act: { sub: FIRST_ACTOR_UID } },
        },
      }).act,
    ).toEqual({
      sub: `acme-auth|${ACTOR_UID}`,
      uid: ACTOR_UID,
      client_id: CLIENT_APP_ID,
      act: {
        sub: `acme-auth|${PRIOR_ACTOR_UID}`,
        uid: PRIOR_ACTOR_UID,
        act: { sub: `acme-auth|${FIRST_ACTOR_UID}`, uid: FIRST_ACTOR_UID },
      },
    });
  });

  test("omits `act` for a token without an actor", () => {
    expect(build("access", { scope: "openid" })).not.toHaveProperty("act");
    expect(build("refresh")).not.toHaveProperty("act");
  });
});
