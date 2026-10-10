import { describe, it, expect } from "bun:test";
import { SignJWT, type CryptoKey } from "jose";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  getExpiryDurationString,
  type AuthTokenTypes,
  type UserData,
} from "@schemavaults/auth-common";
import { generateJWT } from "./generate";
import { decodeJWT } from "./decode";
import { signJWT } from "./sign";
import { verifyJWTSignature } from "./verify_signature";
import signVerifyAlg from "./sign_verify_alg";
import { generateNewJwtKeySet, type JWT_Keys } from "./jwt_keys";
import MockUser from "@/tests/MockUser";

// Access and refresh tokens minted for the auth server's own audience share
// `aud`, `iss`, keyset and subject; the only thing telling them apart is the
// `type` claim in the inner signature. These tests pin that the type is
// enforced in both directions, so a refresh token can never act as an access
// token (and gain the first-party API) and an access token can never be
// redeemed as a refresh token (and gain a refresh token's lifetime).

const env = "test" as const satisfies SchemaVaultsAppEnvironment;
const environment = env;
const auth_server_url: string = getAuthServerUrl(env);

async function authServerKeyset(): Promise<JWT_Keys> {
  return await generateNewJwtKeySet({
    audience_id: DEFAULT_AUTH_SERVER_APP_ID,
    environment,
  });
}

async function mint(
  type: AuthTokenTypes,
  jwt_keys: JWT_Keys,
  user: UserData,
): Promise<string> {
  const generated = await generateJWT({
    type,
    user,
    audience: auth_server_url,
    iat: Date.now(),
    client_app_id: DEFAULT_AUTH_SERVER_APP_ID,
    auth_server_url,
    jwt_keys,
    env,
  });
  return generated.token;
}

describe("access / refresh token type separation", () => {
  it("decodes each token as the type it was minted with (sanity)", async () => {
    const jwt_keys = await authServerKeyset();
    const user: UserData = new MockUser();

    const refresh = await decodeJWT({
      type: "refresh",
      jwt: await mint("refresh", jwt_keys, user),
      jwt_keys,
      env,
    });
    expect(refresh.uid).toBe(user.uid);

    const access = await decodeJWT({
      type: "access",
      jwt: await mint("access", jwt_keys, user),
      audience: auth_server_url,
      jwt_keys,
      env,
    });
    expect(access.uid).toBe(user.uid);
  });

  it("refuses a refresh token presented as an access token for the auth server audience", async () => {
    const jwt_keys = await authServerKeyset();
    const refresh_token = await mint("refresh", jwt_keys, new MockUser());

    expect(
      decodeJWT({
        type: "access",
        jwt: refresh_token,
        audience: auth_server_url,
        jwt_keys,
        env,
      }),
    ).rejects.toThrow();
  });

  it("refuses an auth-server access token presented as a refresh token", async () => {
    const jwt_keys = await authServerKeyset();
    const access_token = await mint("access", jwt_keys, new MockUser());

    expect(
      decodeJWT({
        type: "refresh",
        jwt: access_token,
        jwt_keys,
        env,
      }),
    ).rejects.toThrow();
  });

  // Backward compatibility: the fix adds NO claim to the outer JWE payload,
  // so a token on the wire looks exactly as it did before the fix (and as
  // every token still in circulation does). Type is enforced purely from the
  // inner signature's `type` claim, which has been minted since well beyond
  // the longest token lifetime. A legacy-shaped token must therefore decode
  // for its own type while still being refused for the other type.
  it("decodes a legacy-shaped token (no outer `type` claim) and still enforces type from the signature", async () => {
    const jwt_keys = await authServerKeyset();
    const user: UserData = new MockUser();
    const refresh_token = await mint("refresh", jwt_keys, user);

    const decoded = await decodeJWT({
      type: "refresh",
      jwt: refresh_token,
      jwt_keys,
      env,
    });
    expect(decoded.uid).toBe(user.uid);
    // The token carries no `type` on its outer payload (the strict payload
    // schema has no such field): nothing was added to the wire format.
    expect((decoded as Record<string, unknown>).type).toBeUndefined();

    // ...yet the same unchanged token is still refused as the wrong type.
    expect(
      decodeJWT({
        type: "access",
        jwt: refresh_token,
        audience: auth_server_url,
        jwt_keys,
        env,
      }),
    ).rejects.toThrow();
  });
});

describe("signature 'type' claim enforcement", () => {
  const base = async () => {
    const jwt_keys = await authServerKeyset();
    const user: UserData = new MockUser();
    const iat = Date.now();
    return { jwt_keys, user, iat };
  };

  it("accepts a signature for the matching type and rejects it for the other type", async () => {
    const { jwt_keys, user, iat } = await base();
    const sig = await signJWT({
      jwt_keys,
      audience: auth_server_url,
      iat,
      uid: user.uid,
      email: user.email,
      type: "refresh",
      env,
    });

    expect(
      await verifyJWTSignature({
        jwt_keys,
        jwt: sig,
        aud: auth_server_url,
        iat,
        type: "refresh",
        sub: user.uid,
        uid: user.uid,
        env,
      }),
    ).toBeTrue();

    expect(
      await verifyJWTSignature({
        jwt_keys,
        jwt: sig,
        aud: auth_server_url,
        iat,
        type: "access",
        sub: user.uid,
        uid: user.uid,
        env,
      }),
    ).toBeFalse();
  });

  it("rejects a signature with no type claim at all", async () => {
    const { jwt_keys, user, iat } = await base();
    const signing_key: CryptoKey | null = await jwt_keys.signing_key;
    if (!signing_key) throw new Error("Keyset has no signing key!");
    const keyset_id = jwt_keys.keyset_id;
    // Same shape as signJWT's payload, minus `type`.
    const sig = await new SignJWT({ sub: user.uid, uid: user.uid, env })
      .setProtectedHeader({
        alg: signVerifyAlg,
        keyset_id,
        kid: `${keyset_id}-verification`,
      })
      .setAudience(auth_server_url)
      .setIssuedAt(iat)
      .setIssuer(auth_server_url)
      .setExpirationTime(getExpiryDurationString("refresh"))
      .sign(signing_key);

    for (const type of ["access", "refresh"] as const) {
      expect(
        await verifyJWTSignature({
          jwt_keys,
          jwt: sig,
          aud: auth_server_url,
          iat,
          type,
          sub: user.uid,
          uid: user.uid,
          env,
        }),
      ).toBeFalse();
    }
  });
});
