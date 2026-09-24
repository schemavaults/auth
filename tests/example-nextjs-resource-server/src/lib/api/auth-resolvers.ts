import "server-only";
import { getAppEnvironment, type UserData } from "@schemavaults/auth-server-sdk";
import { createSchemaVaultsAuthResolvers } from "@schemavaults/auth-server-sdk/openapi-operations";
import type { AuthResolvers } from "@schemavaults/openapi-operations";
import type { ExampleApiContext } from "./context";

/**
 * Credential resolvers for this resource server, keyed by auth scheme name:
 * the server SDK's `createSchemaVaultsAuthResolvers()` verifies
 * `Authorization: Bearer <access token>` and the first-party access-token
 * cookie `access_token_<api_server_id>` against the auth server's JWKS
 * through `RouteGuardFactory` (401 for an invalid / expired / revoked
 * token, 403 for a disabled account, 500 with a clear message when
 * `SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY` is missing). The API server
 * id, environment and auth server URL are read from the environment on
 * first use.
 */

/**
 * RFC 8707 resource URL(s) this server is known by, from the
 * comma-separated `SCHEMAVAULTS_ACCEPTED_TOKEN_AUDIENCES` env var. A
 * client (an MCP client, say) that requested its token with
 * `resource=<one of these URLs>` receives a token whose `aud` is that URL
 * rather than this API server's id; listing the URL here accepts it.
 */
export const ACCEPTED_TOKEN_AUDIENCES_ENV_VAR =
  "SCHEMAVAULTS_ACCEPTED_TOKEN_AUDIENCES" as const;

export function getAcceptedTokenAudiences(): readonly string[] {
  const raw = process.env[ACCEPTED_TOKEN_AUDIENCES_ENV_VAR];
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export const authResolvers: AuthResolvers<UserData, ExampleApiContext> =
  createSchemaVaultsAuthResolvers<ExampleApiContext>({
    acceptedAudiences: getAcceptedTokenAudiences(),
    debug: process.env.NODE_ENV === "development" || getAppEnvironment() === "development",
  });
