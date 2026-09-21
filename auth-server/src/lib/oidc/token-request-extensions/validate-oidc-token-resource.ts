import "server-only";
import type {
  ApiServerId,
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { validateAndResolveAudiences } from "@/lib/validate-audience";
import ClientApplicationNotAuthorizedByUser from "@/lib/error/ClientApplicationNotAuthorizedByUser";
import AppNotConnectedToApiServerError from "@/lib/error/AppNotConnectedToApiServerError";
import UnresolvableTokenResourceError from "@/lib/error/UnresolvableTokenResourceError";
import type { OidcTokenRequestError } from "./oidc-token-request-error";

export interface ValidateOidcTokenResourceOptions {
  uid: string;
  client_app_id: AppId;
  /** Token-audience form (auth server URL, API server id, or resource URL). */
  resource: string;
  dbh: ServerlessDatabase;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

export type ValidatedOidcTokenResource =
  | {
      ok: true;
      /**
       * The value to mint into the access token's `aud`: the resource
       * exactly as the client sent it (an RFC 8707 resource URL is echoed
       * verbatim so the resource server can compare it to its own
       * identifier).
       */
      access_token_audience: string;
      /** The API server whose keyset signs/encrypts the token. */
      api_server_id: ApiServerId;
    }
  | { ok: false; error: OidcTokenRequestError };

/**
 * Authorizes a `resource` for the (user, client) pair with the same rules
 * the platform token endpoints use for `audience`: the user must have
 * authorized the client app, the client app must be connected to the
 * API server (or be a dynamically registered client of an API server
 * that allows them), and only the auth server's own app may request
 * auth-server audience tokens. A resource URL is resolved to the API
 * server that registered a matching domain.
 */
export async function validateOidcTokenResource({
  uid,
  client_app_id,
  resource,
  dbh,
  environment,
  debug = false,
}: ValidateOidcTokenResourceOptions): Promise<ValidatedOidcTokenResource> {
  const fail = (error: OidcTokenRequestError): ValidatedOidcTokenResource => ({
    ok: false,
    error,
  });
  try {
    const validated = await validateAndResolveAudiences(
      uid,
      client_app_id,
      resource,
      dbh,
      environment,
      debug,
    );
    if (!validated.ok) {
      return fail({
        error: "invalid_target",
        error_description:
          "The requested 'resource' is not available to this client.",
      });
    }
    const resolved = validated.resolved[0];
    if (!resolved) {
      return fail({
        error: "invalid_target",
        error_description:
          "The requested 'resource' is not available to this client.",
      });
    }
    return {
      ok: true,
      access_token_audience: resolved.token_audience,
      api_server_id: resolved.api_server_id,
    };
  } catch (e: unknown) {
    if (e instanceof ClientApplicationNotAuthorizedByUser) {
      return fail({
        error: "invalid_grant",
        error_description:
          "The user has not authorized this client application.",
      });
    }
    if (e instanceof AppNotConnectedToApiServerError) {
      return fail({
        error: "invalid_target",
        error_description:
          "The client application is not connected to the requested API server.",
      });
    }
    if (e instanceof UnresolvableTokenResourceError) {
      return fail({
        error: "invalid_target",
        error_description:
          e.reason === "ambiguous"
            ? "The 'resource' parameter matches more than one registered API server."
            : "The 'resource' parameter does not identify a registered API server.",
      });
    }
    if (e instanceof TypeError) {
      // validateAudience rejects malformed audiences with a TypeError.
      return fail({
        error: "invalid_target",
        error_description: "Malformed 'resource' parameter.",
      });
    }
    throw e;
  }
}

export default validateOidcTokenResource;
