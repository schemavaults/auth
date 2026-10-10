import { describe, it, expect } from "bun:test";
import { EncryptJWT, SignJWT, type CryptoKey } from "jose";
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
import { alg, enc } from "./encrypt_decrypt_alg";
import signVerifyAlg from "./sign_verify_alg";
import { generateNewJwtKeySet, type JWT_Keys } from "./jwt_keys";
import MockUser from "@/tests/MockUser";

// Access and refresh tokens minted for the auth server's own audience share
// `aud`, `iss`, keyset and subject; the only thing telling them apart is the
// `type` claim. These tests pin that the type is enforced in both
// directions, so a refresh token can never act as an access token (and gain
// the first-party API) and an access token can never be redeemed as a
// refresh token (and gain a refresh token's lifetime).

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

/**
 * Builds the outer JWE the way `generateJWT` does, but with full control
 * over the outer `type` claim, so the outer-payload check can be exercised
 * independently of the signature check and legacy tokens (minted before the
 * outer claim existed) can be simulated.
 */
async function mintWithOuterType({
  jwt_keys,
  user,
  signature_type,
  outer_type,
}: {
  jwt_keys: JWT_Keys;
  user: UserData;
  signature_type: AuthTokenTypes;
  outer_type: AuthTokenTypes | "omit";
}): Promise<string> {
  const iat = Date.now();
  const jti = crypto.randomUUID();
  const keyset_id = jwt_keys.keyset_id;
  const sig = await signJWT({
    jwt_keys,
    audience: auth_server_url,
    iat,
    uid: user.uid,
    email: user.email,
    type: signature_type,
    env,
    auth_server_url,
    jti,
  });
  const encryption_key: CryptoKey | null = await jwt_keys.encryption_key;
  if (!encryption_key) throw new Error("Keyset has no encryption key!");
  return await new EncryptJWT({
    uid: user.uid,
    admin: user.admin ?? false,
    email: user.email,
    email_verified: user.email_verified ?? false,
    aud: auth_server_url,
    app: DEFAULT_AUTH_SERVER_APP_ID,
    disabled: user.disabled ?? false,
    created_at: user.created_at,
    env,
    sig,
    jti,
    ...(outer_type === "omit" ? {} : { type: outer_type }),
  })
    .setProtectedHeader({
      alg,
      enc,
      keyset_id,
      kid: `${keyset_id}-decryption`,
      aud: auth_server_url,
    })
    .setIssuedAt(new Date(iat))
    .setIssuer(auth_server_url)
    .setAudience(auth_server_url)
    .setExpirationTime(getExpiryDurationString(signature_type))
    .setSubject(user.uid)
    .encrypt(encryption_key);
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
    expect(refresh.type).toBe("refresh");

    const access = await decodeJWT({
      type: "access",
      jwt: await mint("access", jwt_keys, user),
      audience: auth_server_url,
      jwt_keys,
      env,
    });
    expect(access.uid).toBe(user.uid);
    expect(access.type).toBe("access");
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

  it("refuses a token whose outer type claim disagrees with the expected type", async () => {
    const jwt_keys = await authServerKeyset();
    const user: UserData = new MockUser();
    const token = await mintWithOuterType({
      jwt_keys,
      user,
      signature_type: "refresh",
      outer_type: "access",
    });

    expect(
      decodeJWT({ type: "refresh", jwt: token, jwt_keys, env }),
    ).rejects.toThrow(/type mismatch/i);
  });

  it("still decodes a legacy token with no outer type claim (signature type decides)", async () => {
    const jwt_keys = await authServerKeyset();
    const user: UserData = new MockUser();
    const legacy_refresh = await mintWithOuterType({
      jwt_keys,
      user,
      signature_type: "refresh",
      outer_type: "omit",
    });

    const decoded = await decodeJWT({
      type: "refresh",
      jwt: legacy_refresh,
      jwt_keys,
      env,
    });
    expect(decoded.uid).toBe(user.uid);
    expect(decoded.type).toBeUndefined();

    // ...but the missing outer claim is no loophole: the signature's type
    // still refuses the other direction.
    expect(
      decodeJWT({
        type: "access",
        jwt: legacy_refresh,
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

  it("rejects a signature minted for the other token type", async () => {
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
