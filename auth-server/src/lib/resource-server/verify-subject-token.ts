import "server-only";
import type { ApiServerId, SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { ServerlessDatabase } from "@/lib/auth-db";
import {
  decodeIntrospectableToken,
  isIntrospectedTokenActive,
  type DecodedIntrospectableToken,
  type OidcIntrospectionCaller,
} from "@/lib/oidc/introspection";

/**
 * Header a resource server sends the user's access token in when it asks
 * about that user's organization memberships beyond its own organization
 * (the RFC 8693 "subject token": the token of the party the request is
 * about, as opposed to the caller's own credential).
 */
export const SUBJECT_TOKEN_HEADER = "x-subject-token" as const;

export interface VerifyResourceServerSubjectTokenOptions {
  dbh: ServerlessDatabase;
  environment: SchemaVaultsAppEnvironment;
  /** The API server that authenticated the request with its JWKS access assertion. */
  api_server_id: ApiServerId;
  /** The user the request is about. */
  uid: string;
  /** The presented subject token. */
  subject_token: string;
}

/**
 * Whether `subject_token` is an active access token that `uid` holds for
 * the calling API server: the same checks RFC 7662 introspection by that
 * API server applies (decrypted with the API server's own keyset, so a
 * token for any other audience fails; not revoked, the user still
 * authorizes the client app, the client app is still connected to the API
 * server), plus the subject match.
 *
 * Binds membership lookups to a user who is actively using the API server:
 * a leaked JWKS access key alone cannot enumerate anybody's memberships.
 * Database failures propagate.
 */
export async function verifyResourceServerSubjectToken({
  dbh,
  environment,
  api_server_id,
  uid,
  subject_token,
}: VerifyResourceServerSubjectTokenOptions): Promise<boolean> {
  if (typeof subject_token !== "string" || subject_token.length === 0) {
    return false;
  }
  const caller: OidcIntrospectionCaller = { kind: "api_server", api_server_id };
  const decoded: DecodedIntrospectableToken | null = await decodeIntrospectableToken({
    db: dbh.db,
    token: subject_token,
    caller,
    environment,
  });
  if (!decoded || decoded.kind !== "access" || decoded.payload.uid !== uid) {
    return false;
  }
  return await isIntrospectedTokenActive({ dbh, payload: decoded.payload, caller });
}

export default verifyResourceServerSubjectToken;
