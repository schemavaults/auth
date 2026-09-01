import { SignJWT, type CryptoKey } from "jose";
import {
  getAuthServerAppId,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  buildOidcProfileClaims,
  formatOidcSubClaim,
  type UserData,
} from "@schemavaults/auth-common";
import type { I_JWT_Keys } from "./jwt_keys";
import signAndVerifyAlg from "./sign_verify_alg";
import isValidUuid from "@/utils/isValidUuid";

/**
 * OIDC id_token lifetime in seconds. Deliberately short-lived: the
 * id_token is an identity assertion consumed by the RP at login time,
 * not an access credential.
 */
export const ID_TOKEN_EXPIRY = 3600 as const;

export interface GenerateIdTokenOptions {
  user: UserData;
  /** The OIDC client_id (= platform app_id) — becomes the `aud` claim. */
  client_id: string;
  /** Echoed verbatim as the `nonce` claim when present (OIDC Core §2). */
  nonce?: string | null;
  /**
   * Granted OIDC scopes; `email`/`email_verified` claims are only
   * included when the `email` scope was granted, and the profile name
   * claims (`name`, `given_name`, `middle_name`, `family_name`,
   * `preferred_username`) only when the `profile` scope was granted.
   */
  scopes: readonly string[];
  /**
   * Keyset whose RS256 signing key signs the id_token. Its public
   * verification half must be published at the OIDC jwks_uri under the
   * kid `<keyset_id>-verification`.
   */
  jwt_keys: I_JWT_Keys;
  environment: SchemaVaultsAppEnvironment;
  auth_server_url?: string;
  /**
   * This deployment's own app id (SCHEMAVAULTS_AUTH_SERVER_APP_ID) —
   * prefixes the `sub` claim as `<auth_server_app_id>|<uid>` (see
   * formatOidcSubClaim in @schemavaults/auth-common). Server-side
   * callers may rely on the env-resolved default.
   */
  auth_server_app_id?: string;
}

export interface GeneratedIdToken {
  id_token: string;
  /** Seconds until expiry (= ID_TOKEN_EXPIRY). */
  expires_in: number;
}

/**
 * Mints an OIDC Core §2 id_token: a plain RS256-signed JWS (NOT the
 * platform's encrypted JWE access-token format) that any relying party
 * can verify against the public JWKS. The `kid` header follows the
 * platform convention (`<keyset_id>-verification`) so it matches the
 * keys served by the jwks_uri.
 */
export async function generateIdToken({
  user,
  client_id,
  nonce,
  scopes,
  jwt_keys,
  environment,
  auth_server_url = getAuthServerUrl(environment),
  auth_server_app_id = getAuthServerAppId(),
}: GenerateIdTokenOptions): Promise<GeneratedIdToken> {
  if (typeof user?.uid !== "string" || user.uid.length === 0) {
    throw new TypeError("generateIdToken requires a user with a uid!");
  }
  if (typeof client_id !== "string" || client_id.length === 0) {
    throw new TypeError("generateIdToken requires a client_id!");
  }
  if (typeof auth_server_url !== "string" || auth_server_url.length === 0) {
    throw new TypeError(
      "Failed to resolve auth server URL to be used as the id_token 'iss' claim!",
    );
  }

  const keyset_id: string = jwt_keys.keyset_id;
  if (typeof keyset_id !== "string" || !isValidUuid(keyset_id)) {
    throw new TypeError("Invalid keyset ID on the provided JWT keys!");
  }

  const signing_key_promise: Promise<CryptoKey> | null = jwt_keys.signing_key;
  if (!signing_key_promise) {
    throw new Error(
      "Failed to load private signing key from the provided JWT keys!",
    );
  }
  const signing_key: CryptoKey = await signing_key_promise;

  const claims: Record<string, unknown> = {};
  if (typeof nonce === "string" && nonce.length > 0) {
    claims.nonce = nonce;
  }
  if (scopes.includes("email")) {
    claims.email = user.email;
    claims.email_verified = user.email_verified ?? false;
  }
  if (scopes.includes("profile")) {
    // OIDC Core §5.1 profile-scoped claims, derived from the user's
    // stored name fields (the `name` claim prefers the public display
    // name). Claims with no stored value are omitted, and /userinfo
    // derives the same claims via the same builder.
    Object.assign(claims, buildOidcProfileClaims(user));
  }

  const id_token: string = await new SignJWT(claims)
    .setProtectedHeader({
      alg: signAndVerifyAlg,
      typ: "JWT",
      kid: `${keyset_id}-verification`,
    })
    .setIssuer(auth_server_url)
    // The OIDC-facing subject is namespaced by this deployment's app id
    // (`<app_id>|<uid>`); /api/oidc/userinfo and introspection MUST
    // report the same form (OIDC Core §5.3.2 — RP libraries reject a
    // userinfo `sub` that differs from the id_token's).
    .setSubject(formatOidcSubClaim(auth_server_app_id, user.uid))
    .setAudience(client_id)
    // jose defaults to the current unix time in SECONDS; do not pass
    // Date.now() here (milliseconds) like sign.ts does for the internal
    // `sig` JWS — OIDC RP libraries validate iat/exp as seconds.
    .setIssuedAt()
    .setExpirationTime(`${ID_TOKEN_EXPIRY}s`)
    .sign(signing_key);

  return { id_token, expires_in: ID_TOKEN_EXPIRY };
}

export default generateIdToken;
