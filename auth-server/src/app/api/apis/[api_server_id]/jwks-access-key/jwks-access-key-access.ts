import type { UserData } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import captureServerException from "@/lib/captureServerException";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import hasUserAccessToApiServer from "@/lib/isUserInApiOwnerOrganization";

export const ROUTE = "/api/apis/{api_server_id}/jwks-access-key";

export const JWKS_ACCESS_KEY_AUTH_NOTES =
  "Organization owners/admins of the owning organization, the owning user of a user-owned API server, or platform administrators. Refused for the auth server's own API server, which is the JWKS provider itself.";

export type JwksAccessKeyRefusal = { status: 403 | 500; message: string };

/**
 * The checks every JWKS access key management operation performs before
 * touching the key registry, in this order:
 *
 * 1. The auth server's own API server is the JWKS provider, so its access
 *    keys cannot be managed here (403 for everyone, administrators included).
 * 2. The caller must be an organization owner/admin of the API server's
 *    owner organization (or its owning user), unless they are a platform
 *    administrator. A failed lookup (e.g. unknown API server) is a 500.
 *
 * Returns the refusal to send, or null when the caller may proceed.
 */
export async function refuseJwksAccessKeyManagement(
  db: Kysely<AuthDatabase>,
  user: UserData,
  api_server_id: string,
  options: { op_name: string; forbiddenMessage: string },
): Promise<JwksAccessKeyRefusal | null> {
  // Block JWKS access key management for the auth server's own API - it is the JWKS provider
  const auth_server_app_id = getAuthServerAppId();
  if (api_server_id === auth_server_app_id) {
    return {
      status: 403,
      message: `JWKS access keys cannot be managed for the '${auth_server_app_id}' API server`,
    };
  }

  // Verify user is in the owner organization
  try {
    const isAuthorized = await hasUserAccessToApiServer(user, api_server_id, db);
    if (!isAuthorized && !user.admin) {
      return { status: 403, message: options.forbiddenMessage };
    }
  } catch (e: unknown) {
    await captureServerException(db, e, {
      op_name: `${options.op_name}.hasUserAccessToApiServer`,
      route: ROUTE,
      uid: user.uid,
      context: { api_server_id },
    });
    return { status: 500, message: "Failed to verify authorization" };
  }

  return null;
}
