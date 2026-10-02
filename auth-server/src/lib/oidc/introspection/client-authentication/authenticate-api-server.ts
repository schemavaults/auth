import "server-only";
import { apiServerIdSchema, type ApiServerId } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import verifyJwksAccessAssertion from "@/app/api/jwks/[audience]/verifyJwksAccessAssertion";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import { getUnverifiedAssertionIssuer } from "./get-unverified-assertion-issuer";
import {
  invalidIntrospectionClient,
  type AuthenticateIntrospectionCallerResult,
} from "./types";

export interface AuthenticateApiServerOptions {
  db: Kysely<AuthDatabase>;
  client_assertion: string;
  /** The request's `client_id`, if sent. */
  client_id: string | null;
}

/**
 * `private_key_jwt` (RFC 7523 §2.2) for API servers: the assertion is a
 * JWKS access proof token (`createJwksAccessProofToken()` from
 * @schemavaults/jwt) signed with the API server's JWKS access key — `iss` =
 * `sub` = the API server id, `aud` = the auth server URL (the issuer),
 * single-use `jti`, 60s lifetime. `client_id`, when sent, must name the same
 * API server (RFC 7521 §4.2).
 */
export async function authenticateApiServer({
  db,
  client_assertion,
  client_id,
}: AuthenticateApiServerOptions): Promise<AuthenticateIntrospectionCallerResult> {
  const issuer: string | null = getUnverifiedAssertionIssuer(client_assertion);
  const parsed_api_server_id = apiServerIdSchema.safeParse(issuer);
  if (!parsed_api_server_id.success) {
    return invalidIntrospectionClient(
      "The client assertion must be a JWT whose 'iss' is the API server id.",
    );
  }
  const api_server_id: ApiServerId = parsed_api_server_id.data;
  if (client_id !== null && client_id !== api_server_id) {
    return invalidIntrospectionClient(
      "The client assertion's issuer does not match the request's client_id.",
    );
  }
  // The auth server never holds a JWKS access key (its key management
  // endpoints refuse it).
  if (
    api_server_id === getAuthServerAppId() ||
    !(await verifyJwksAccessAssertion(client_assertion, api_server_id, db))
  ) {
    return invalidIntrospectionClient("Invalid client assertion.");
  }
  return { ok: true, caller: { kind: "api_server", api_server_id } };
}

export default authenticateApiServer;
