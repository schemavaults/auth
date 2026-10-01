import "server-only";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { ServerlessDatabase } from "@/lib/auth-db";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import { getAuthServerUri } from "@/lib/auth_server_uri";
import { buildActiveIntrospectionResponse } from "./build-active-introspection-response";
import { decodeIntrospectableToken } from "./decode-introspectable-token";
import { isIntrospectedTokenActive } from "./is-introspected-token-active";
import {
  INACTIVE_INTROSPECTION_RESPONSE,
  type DecodedIntrospectableToken,
  type OidcIntrospectionCaller,
  type OidcIntrospectionResponseBody,
} from "./types";

export interface IntrospectOidcTokenOptions {
  dbh: ServerlessDatabase;
  /** The `token` parameter value presented for introspection. */
  token: string;
  /** The authenticated caller asking about the token. */
  caller: OidcIntrospectionCaller;
  environment: SchemaVaultsAppEnvironment;
}

/**
 * Evaluates the state of a token issued by this server (RFC 7662 §2) for
 * an authenticated caller, in three steps:
 *
 *  1. verify the token and check the caller may see it
 *     ({@link decodeIntrospectableToken}; the rules are in
 *     caller-visibility.ts);
 *  2. check nothing since issuance revoked it
 *     ({@link isIntrospectedTokenActive});
 *  3. report its metadata ({@link buildActiveIntrospectionResponse}).
 *
 * Every negative outcome is the same bare `{ active: false }`.
 */
export async function introspectOidcToken({
  dbh,
  token,
  caller,
  environment,
}: IntrospectOidcTokenOptions): Promise<OidcIntrospectionResponseBody> {
  const decoded: DecodedIntrospectableToken | null =
    await decodeIntrospectableToken({ db: dbh.db, token, caller, environment });
  if (!decoded) {
    return INACTIVE_INTROSPECTION_RESPONSE;
  }

  if (!(await isIntrospectedTokenActive({ dbh, payload: decoded.payload, caller }))) {
    return INACTIVE_INTROSPECTION_RESPONSE;
  }

  return buildActiveIntrospectionResponse({
    token: decoded,
    auth_server_app_id: getAuthServerAppId(),
    issuer: getAuthServerUri(environment),
  });
}

export default introspectOidcToken;
