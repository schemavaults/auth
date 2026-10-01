import "server-only";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
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
  isTokenIssuedToCaller,
  resolveIntrospectionDecodePlan,
  type IntrospectionDecodePlan,
} from "./caller-visibility";
import type {
  DecodedIntrospectableToken,
  OidcIntrospectionCaller,
} from "./types";

export interface DecodeIntrospectableTokenOptions {
  db: Kysely<AuthDatabase>;
  /** The `token` parameter value presented for introspection. */
  token: string;
  caller: OidcIntrospectionCaller;
  environment: SchemaVaultsAppEnvironment;
}

/**
 * Verifies the presented token for the caller: decodeJWT enforces
 * decryption, signature, issuer, audience, environment and max token age,
 * with the keyset the caller's decode plan names (see
 * {@link resolveIntrospectionDecodePlan}).
 *
 * Returns null — never throws — for anything the caller must see as
 * inactive (§2.2): malformed input, an audience the caller may not see,
 * a token issued to another client, an unknown keyset, or a token that
 * fails verification.
 */
export async function decodeIntrospectableToken({
  db,
  token,
  caller,
  environment,
}: DecodeIntrospectableTokenOptions): Promise<DecodedIntrospectableToken | null> {
  try {
    const plan: IntrospectionDecodePlan | null = resolveIntrospectionDecodePlan({
      caller,
      token_audience: getAudienceFromToken(token, environment),
      environment,
    });
    if (!plan) {
      return null;
    }

    const jwt_keys: I_JWT_Keys = await new AuthServerJwtKeysManager(db).getKeyset(
      plan.keyset_audience_id,
      getKeysetIdFromToken(token),
    );
    const payload: CustomJWTPayload =
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

    return isTokenIssuedToCaller(caller, payload)
      ? { kind: plan.kind, payload }
      : null;
  } catch {
    return null;
  }
}

export default decodeIntrospectableToken;
