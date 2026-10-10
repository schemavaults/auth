import "server-only";
import type { CustomJWTPayload } from "@schemavaults/jwt";
import {
  getUserTokensValidAfter,
  isTokenRevoked,
  type ServerlessDatabase,
} from "@/lib/auth-db";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import { isClientAppPermittedForApiServer } from "@/lib/validate-audience";
import {
  evaluateIntrospectedTokenActivity,
  type IntrospectedTokenActivitySignals,
} from "./introspected-token-activity";
import type { OidcIntrospectionCaller } from "./types";

export interface IsIntrospectedTokenActiveOptions {
  dbh: ServerlessDatabase;
  /** A token that verified and that the caller may see. */
  payload: CustomJWTPayload;
  caller: OidcIntrospectionCaller;
}

/** The activity signals read from the database. */
function databaseActivitySignals(
  dbh: ServerlessDatabase,
): IntrospectedTokenActivitySignals {
  return {
    isJtiRevoked: (jti) => isTokenRevoked(dbh.db, jti),
    getTokensValidAfter: (uid) => getUserTokensValidAfter(dbh.db, uid),
    isAppAuthorizedForUser: (uid, app_id) =>
      isAppAuthorizedForUser(dbh.db, uid, app_id),
    isClientAppPermittedForApiServer: (app_id, api_server_id) =>
      isClientAppPermittedForApiServer(app_id, api_server_id, dbh),
  };
}

/**
 * Whether a verified token is still active, decided by
 * {@link evaluateIntrospectedTokenActivity} from the revocation, consent and
 * app-to-API connection records in the database. Database failures
 * propagate (the endpoint answers `server_error`) rather than reporting a
 * token inactive it may not be.
 */
export async function isIntrospectedTokenActive({
  dbh,
  payload,
  caller,
}: IsIntrospectedTokenActiveOptions): Promise<boolean> {
  return await evaluateIntrospectedTokenActivity({
    payload,
    caller,
    signals: databaseActivitySignals(dbh),
  });
}

export default isIntrospectedTokenActive;
