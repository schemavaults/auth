import "server-only";
import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import {
  decodeJWT,
  getAudienceFromToken,
  getKeysetIdFromToken,
  type CustomJWTPayload,
  type I_JWT_Keys,
} from "@schemavaults/jwt";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import {
  resolveIntrospectionDecodePlan,
  type IntrospectionDecodePlan,
} from "@/lib/oidc/introspection/caller-visibility";
import type { RevocableToken } from "./types";

export interface DecodeRevocableTokenOptions {
  db: Kysely<AuthDatabase>;
  /** The `token` parameter value presented for revocation. */
  token: string;
  /** The authenticated client asking for the revocation. */
  client_app_id: AppId;
  environment: SchemaVaultsAppEnvironment;
}

/**
 * Verifies a token presented for revocation by `client_app_id`. A client
 * can revoke exactly the tokens it could introspect, so the introspection
 * rules for a client-app caller (resolveIntrospectionDecodePlan) pick the
 * keyset: the refresh tokens issued to it and its `oidc-userinfo` access
 * tokens. decodeJWT then enforces decryption, signature, issuer, audience,
 * environment and max token age.
 *
 *  - `unverifiable`: not a live token of this server (malformed, unknown
 *    keyset, failed verification, expired); RFC 7009 §2.2 answers 200.
 *  - `unsupported`: an access token minted for an API server (its id or an
 *    RFC 8707 resource URL as `aud`). It ends with the refresh token it was
 *    minted alongside, or when it expires.
 *  - `issued_to_another_client`: a live token whose `app` claim names
 *    another client; §2.1 refuses the request.
 *
 * A failed keyset lookup (database) throws, so the client gets an error and
 * keeps treating the token as live instead of a 200 that revoked nothing.
 */
export async function decodeRevocableToken({
  db,
  token,
  client_app_id,
  environment,
}: DecodeRevocableTokenOptions): Promise<RevocableToken> {
  let plan: IntrospectionDecodePlan | null;
  let keyset_id: string;
  try {
    plan = resolveIntrospectionDecodePlan({
      caller: { kind: "client_app", client_app_id },
      token_audience: getAudienceFromToken(token, environment),
      environment,
    });
    if (!plan) {
      return { kind: "unsupported" };
    }
    keyset_id = getKeysetIdFromToken(token);
  } catch {
    return { kind: "unverifiable" };
  }

  const jwt_keys: I_JWT_Keys | null = await new AuthServerJwtKeysManager(
    db,
  ).findKeyset(plan.keyset_audience_id, keyset_id);
  if (!jwt_keys) {
    return { kind: "unverifiable" };
  }

  let payload: CustomJWTPayload;
  try {
    payload =
      plan.kind === "access"
        ? await decodeJWT({
            type: "access",
            jwt: token,
            audience: plan.expected_audience,
            jwt_keys,
            env: environment,
          })
        : await decodeJWT({
            type: "refresh",
            jwt: token,
            jwt_keys,
            env: environment,
          });
  } catch {
    return { kind: "unverifiable" };
  }

  return payload.app === client_app_id
    ? { kind: plan.kind, payload }
    : { kind: "issued_to_another_client" };
}

export default decodeRevocableToken;
