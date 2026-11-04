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
import UnresolvableTokenResourceError from "@/lib/error/UnresolvableTokenResourceError";
import {
  resolveIntrospectionDecodePlan,
  type IntrospectionDecodePlan,
} from "@/lib/oidc/introspection/caller-visibility";
import { resolveTokenAudience, type ResolvedTokenAudience } from "@/lib/oidc/resolve-token-audience";
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
 * Verifies `token` with the keyset `plan` names: decodeJWT enforces
 * decryption, signature, issuer, audience, environment and max token age.
 * Null for a token that does not verify (malformed, unknown keyset, failed
 * verification, expired). A failed keyset lookup (database) throws.
 */
async function decodeWithPlan(
  db: Kysely<AuthDatabase>,
  token: string,
  plan: IntrospectionDecodePlan,
  environment: SchemaVaultsAppEnvironment,
): Promise<CustomJWTPayload | null> {
  let keyset_id: string;
  try {
    keyset_id = getKeysetIdFromToken(token);
  } catch {
    return null;
  }
  const jwt_keys: I_JWT_Keys | null = await new AuthServerJwtKeysManager(
    db,
  ).findKeyset(plan.keyset_audience_id, keyset_id);
  if (!jwt_keys) {
    return null;
  }
  try {
    return plan.kind === "access"
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
    return null;
  }
}

/**
 * An access token minted for an API server (its id or an RFC 8707 resource
 * URL as `aud`), presented by a client. Only a DELEGATED one (RFC 8693
 * `act`, minted by the token exchange grant) is revocable here: it has no
 * refresh token to end with, and the client that obtained it for an agent
 * must be able to end it when the agent's session ends. It is verified with
 * the API server's keyset, as that API server's introspection would.
 *
 *  - a token that does not verify, or names a resource URL no API server
 *    registered: `unverifiable` (§2.2: 200, nothing is live);
 *  - a live token without `act`: `unsupported`, as before (it ends with the
 *    refresh token it was minted alongside);
 *  - a live delegated token of another client: `issued_to_another_client`.
 */
async function decodeApiServerAccessToken({
  db,
  token,
  token_audience,
  client_app_id,
  environment,
}: DecodeRevocableTokenOptions & { token_audience: string }): Promise<RevocableToken> {
  let resolved: ResolvedTokenAudience;
  try {
    resolved = await resolveTokenAudience(db, token_audience, environment);
  } catch (e: unknown) {
    if (e instanceof TypeError || e instanceof UnresolvableTokenResourceError) {
      return { kind: "unverifiable" };
    }
    throw e;
  }
  let plan: IntrospectionDecodePlan | null = null;
  if (resolved.kind !== "auth-server") {
    try {
      plan = resolveIntrospectionDecodePlan({
        caller: { kind: "api_server", api_server_id: resolved.api_server_id },
        token_audience,
        environment,
      });
    } catch {
      return { kind: "unverifiable" };
    }
  }
  if (!plan) {
    // An access token for the auth server's own audience: first-party only.
    return { kind: "unsupported" };
  }
  const payload: CustomJWTPayload | null = await decodeWithPlan(db, token, plan, environment);
  if (!payload) {
    return { kind: "unverifiable" };
  }
  if (!payload.act) {
    return { kind: "unsupported" };
  }
  return payload.app === client_app_id
    ? { kind: "access", payload }
    : { kind: "issued_to_another_client" };
}

/**
 * Verifies a token presented for revocation by `client_app_id`. A client
 * can revoke the tokens it could introspect, so the introspection rules for
 * a client-app caller (resolveIntrospectionDecodePlan) pick the keyset: the
 * refresh tokens issued to it and its `oidc-userinfo` access tokens. It can
 * also revoke the delegated access tokens it obtained by token exchange
 * (see decodeApiServerAccessToken).
 *
 *  - `unverifiable`: not a live token of this server (malformed, unknown
 *    keyset, failed verification, expired); RFC 7009 §2.2 answers 200.
 *  - `unsupported`: an access token minted for an API server that is not a
 *    delegated token. It ends with the refresh token it was minted
 *    alongside, or when it expires.
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
  let token_audience: string;
  let plan: IntrospectionDecodePlan | null;
  try {
    token_audience = getAudienceFromToken(token, environment);
    plan = resolveIntrospectionDecodePlan({
      caller: { kind: "client_app", client_app_id },
      token_audience,
      environment,
    });
  } catch {
    return { kind: "unverifiable" };
  }
  if (!plan) {
    return await decodeApiServerAccessToken({
      db,
      token,
      token_audience,
      client_app_id,
      environment,
    });
  }

  const payload: CustomJWTPayload | null = await decodeWithPlan(db, token, plan, environment);
  if (!payload) {
    return { kind: "unverifiable" };
  }
  return payload.app === client_app_id
    ? { kind: plan.kind, payload }
    : { kind: "issued_to_another_client" };
}

export default decodeRevocableToken;
