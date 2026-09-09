import "server-only";
import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { ServerlessDatabase } from "@/lib/auth-db";
import validateAudience from "@/lib/validate-audience";
import ClientApplicationNotAuthorizedByUser from "@/lib/error/ClientApplicationNotAuthorizedByUser";
import AppNotConnectedToApiServerError from "@/lib/error/AppNotConnectedToApiServerError";
import type { OidcTokenRequestError } from "./oidc-token-request-error";

export interface ValidateOidcTokenResourceOptions {
  uid: string;
  client_app_id: AppId;
  /** Token-audience form (auth server URL or API server id). */
  resource: string;
  dbh: ServerlessDatabase;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

/**
 * Authorizes a `resource` for the (user, client) pair with the same rules
 * the platform token endpoints use for `audience`: the user must have
 * authorized the client app, the client app must be connected to the
 * API server, and only the auth server's own app may request auth-server
 * audience tokens. Returns `null` when the resource is allowed.
 */
export async function validateOidcTokenResource({
  uid,
  client_app_id,
  resource,
  dbh,
  environment,
  debug = false,
}: ValidateOidcTokenResourceOptions): Promise<OidcTokenRequestError | null> {
  try {
    const allowed: boolean = await validateAudience(
      uid,
      client_app_id,
      resource,
      dbh,
      environment,
      debug,
    );
    if (!allowed) {
      return {
        error: "invalid_target",
        error_description:
          "The requested 'resource' is not available to this client.",
      };
    }
    return null;
  } catch (e: unknown) {
    if (e instanceof ClientApplicationNotAuthorizedByUser) {
      return {
        error: "invalid_grant",
        error_description:
          "The user has not authorized this client application.",
      };
    }
    if (e instanceof AppNotConnectedToApiServerError) {
      return {
        error: "invalid_target",
        error_description:
          "The client application is not connected to the requested API server.",
      };
    }
    if (e instanceof TypeError) {
      // validateAudience rejects malformed audiences with a TypeError.
      return {
        error: "invalid_target",
        error_description: "Malformed 'resource' parameter.",
      };
    }
    throw e;
  }
}

export default validateOidcTokenResource;
