import { describe, it, expect } from "bun:test";
import { importJWK, jwtVerify, decodeProtectedHeader } from "jose";
import type { UserData } from "@schemavaults/auth-common";
import generateNewJwtKeySet from "./jwt_keys/generate_new_jwt_keyset";
import to_public_verification_jwks from "./jwt_keys/to_public_verification_jwks";
import { generateIdToken, ID_TOKEN_EXPIRY } from "./generate_id_token";

const environment = "test" as const;
const AUTH_SERVER_URL = "http://schemavaults-auth" as const;

function makeUser(): UserData {
  const uid = crypto.randomUUID();
  return {
    uid,
    sub: uid,
    email: "user@example.com",
    email_verified: true,
    created_at: Date.now() - 1000,
  };
}

describe("generateIdToken", () => {
  it("mints an RS256 JWS verifiable against the public verification JWK", async () => {
    const keyset = await generateNewJwtKeySet({
      audience_id: "oidc-userinfo",
      environment,
    });
    const user = makeUser();
    const client_id = "example-client-app";
    const nonce = "n-0S6_WzA2Mj";

    const { id_token, expires_in } = await generateIdToken({
      user,
      client_id,
      nonce,
      scopes: ["openid", "email"],
      jwt_keys: keyset,
      environment,
      auth_server_url: AUTH_SERVER_URL,
    });
    expect(expires_in).toBe(ID_TOKEN_EXPIRY);

    // Header carries the platform kid convention + RS256
    const header = decodeProtectedHeader(id_token);
    expect(header.alg).toBe("RS256");
    expect(header.typ).toBe("JWT");
    expect(header.kid).toBe(`${keyset.keyset_id}-verification`);

    // Verifies against the PUBLIC key as served by the jwks_uri
    const jwks = await to_public_verification_jwks(keyset);
    const public_jwk = jwks.keys.find((k) => k.kid === header.kid);
    expect(public_jwk).toBeDefined();
    const public_key = await importJWK(public_jwk!, "RS256");

    const { payload } = await jwtVerify(id_token, public_key, {
      issuer: AUTH_SERVER_URL,
      audience: client_id,
    });
    expect(payload.sub).toBe(user.uid);
    expect(payload.nonce).toBe(nonce);
    expect(payload.email).toBe(user.email);
    expect(payload.email_verified).toBe(true);

    // iat/exp are unix SECONDS (not the ms iat bug in sign.ts)
    const now_seconds = Math.floor(Date.now() / 1000);
    expect(payload.iat).toBeNumber();
    expect(Math.abs(payload.iat! - now_seconds)).toBeLessThanOrEqual(5);
    expect(payload.exp).toBe(payload.iat! + ID_TOKEN_EXPIRY);
  });

  it("omits nonce and email claims when not requested/granted", async () => {
    const keyset = await generateNewJwtKeySet({
      audience_id: "oidc-userinfo",
      environment,
    });
    const { id_token } = await generateIdToken({
      user: makeUser(),
      client_id: "example-client-app",
      nonce: null,
      scopes: ["openid"],
      jwt_keys: keyset,
      environment,
      auth_server_url: AUTH_SERVER_URL,
    });

    const jwks = await to_public_verification_jwks(keyset);
    const public_key = await importJWK(jwks.keys[0]!, "RS256");
    const { payload } = await jwtVerify(id_token, public_key, {
      issuer: AUTH_SERVER_URL,
    });
    expect(payload).not.toHaveProperty("nonce");
    expect(payload).not.toHaveProperty("email");
    expect(payload).not.toHaveProperty("email_verified");
  });
});
