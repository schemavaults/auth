import {
  type ServerlessDatabase,
  SchemaVaultsAppToApiPermissionsRegistry,
} from "@/lib/auth-db";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import { getApp } from "@/lib/auth-db/apps";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  type ApiServerId,
  type AppId,
  appIdSchema,
  isDynamicallyRegisteredClient,
  type SchemaVaultsApiServerDefinition,
  type SchemaVaultsApp,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import { createAudienceSchema } from "@schemavaults/auth-common";
import isValidUuid from "@/lib/is-valid-uuid";
import ClientApplicationNotAuthorizedByUser from "@/lib/error/ClientApplicationNotAuthorizedByUser";
import AppNotConnectedToApiServerError from "@/lib/error/AppNotConnectedToApiServerError";
import UnresolvableTokenResourceError from "@/lib/error/UnresolvableTokenResourceError";
import {
  resolveTokenAudience,
  type ResolvedTokenAudience,
} from "@/lib/oidc/resolve-token-audience";
import { z } from "zod";

export type ValidateAudienceOutput =
  | "auth-server-only"
  | "api-resource-server"
  | false;

/**
 * @description Whether a dynamically registered client may access an API
 * server without an explicit app-to-API connection: the API server must
 * have opted in with `allow_dynamic_clients`. Managed (console-created)
 * clients always need a connection, whatever the API server's policy.
 */
function mayDynamicClientBypassConnection(
  client_app: SchemaVaultsApp,
  api_server: SchemaVaultsApiServerDefinition | null,
): boolean {
  return (
    isDynamicallyRegisteredClient(client_app) &&
    api_server?.allow_dynamic_clients === true
  );
}

async function validateOneAudience(
  client_app: SchemaVaultsApp,
  resolved: ResolvedTokenAudience,
  dbh: ServerlessDatabase,
  debug: boolean = false,
): Promise<ValidateAudienceOutput> {
  if (resolved.kind === "auth-server") {
    return "auth-server-only";
  }

  const client_app_id: AppId = client_app.app_id;
  const aud: ApiServerId = resolved.api_server_id;

  // Dynamically registered clients have no connections; an API server
  // that opted into serving them is reachable without one.
  if (isDynamicallyRegisteredClient(client_app)) {
    let api_server: SchemaVaultsApiServerDefinition | null = resolved.api_server;
    if (api_server === null) {
      try {
        api_server = await new SchemaVaultsApiServerRegistry(
          dbh.db,
          debug,
        ).getApiServer(aud);
      } catch (e: unknown) {
        console.error(
          `[validateOneAudience] Failed to load API server '${aud}' to evaluate its dynamic-client policy: `,
          e,
        );
        return false;
      }
    }
    if (mayDynamicClientBypassConnection(client_app, api_server)) {
      if (debug) {
        console.log(
          `[validateOneAudience] API server '${aud}' allows dynamic clients; skipping the app-to-API connection check for '${client_app_id}'`,
        );
      }
      return "api-resource-server";
    }
  }

  // Validate that the frontend app has authorized API server audience
  try {
    const permsRegistry = new SchemaVaultsAppToApiPermissionsRegistry(
      dbh.db,
      debug,
    );
    const permission: boolean = await permsRegistry.isAllowed(
      client_app_id,
      aud,
    );
    if (typeof permission !== "boolean") {
      throw new Error(
        "Expected result of AppToApiPermissionsRegistry.isAllowed(...) to be a boolean!",
      );
    }
    if (debug) {
      console.log(
        `[validateOneAudience] AppToApiPermissionsRegistry.isAllowed(client_app_id='${client_app_id}', audience='${aud}') => ${permission ? "Allowed" : "Not Allowed"}`,
      );
    }
    if (!permission) {
      throw new AppNotConnectedToApiServerError(client_app_id, aud);
    }
  } catch (e: unknown) {
    if (e instanceof AppNotConnectedToApiServerError) {
      throw e;
    }
    console.error(
      "Failed to check if frontend application has permission to access API server: ",
      e,
    );
    return false;
  }

  return "api-resource-server";
}

export type ValidatedAudiences =
  | { ok: true; resolved: readonly ResolvedTokenAudience[] }
  | { ok: false };

/**
 * @description Validates that `client_app_id`, authorized by user `uid`,
 * may be issued access tokens for every audience in `audience`, and
 * resolves each audience to the API server that will verify the token
 * (an RFC 8707 resource URL resolves through the API servers' registered
 * domains). Only the auth server's own app may request auth-server
 * audience tokens; every other audience needs an app-to-API connection —
 * unless the client was dynamically registered and the API server allows
 * dynamic clients.
 *
 * @throws TypeError for malformed ids / audiences.
 * @throws ClientApplicationNotAuthorizedByUser when the user has not
 * authorized the client app.
 * @throws AppNotConnectedToApiServerError when the app is not connected to
 * a requested API server.
 * @throws UnresolvableTokenResourceError when a resource URL matches no,
 * or more than one, registered API server.
 */
export async function validateAndResolveAudiences(
  uid: string,
  client_app_id: AppId,
  audience: string | readonly string[],
  dbh: ServerlessDatabase,
  environment: SchemaVaultsAppEnvironment,
  debug: boolean = shouldEnableDebug(),
): Promise<ValidatedAudiences> {
  const auth_app_id = getAuthServerAppId();

  if (!isValidUuid(uid)) {
    throw new TypeError("Expected 'uid' to be a valid UUID!");
  } else if (!(await appIdSchema.safeParseAsync(client_app_id)).success) {
    throw new TypeError("Expected 'client_app_id' to be a valid client application ID!")
  }

  if (typeof audience === "undefined" || !audience) {
    throw new Error("Did not receive an audience to validate!");
  }

  const audiences: string[] = Array.isArray(audience) ? [...audience] : [audience];

  if (!Array.isArray(audiences)) {
    throw new TypeError(
      "Expected type of 'audiences' to be an array by this point!",
      { cause: `Received type '${typeof audiences}'`}
    )
  }

  // An explicitly empty audience list means the grant mints no access
  // tokens (login/refresh-rotation only — e.g. a client app configured with
  // no default token audiences). There are no audiences to validate, but the
  // client app must still be authorized by the user.
  const isEmptyAudienceList: boolean = audiences.length === 0;

  // Audiences arrive in token-audience form (the auth server URL, an api
  // server id verbatim, or an RFC 8707 resource URL); the token endpoints
  // parse request bodies with this same schema, so the bare auth app id
  // form was already rejected upstream.
  const singleAudienceSchema = createAudienceSchema(z, environment);
  const audiencesListSchema = singleAudienceSchema.array()
    .min(1, "Audiences array must be non-empty")
    .max(16, "Cannot request more than 16 access tokens at once");

  if (!isEmptyAudienceList) {
    const parsedNonEmptyAudiencesList = await audiencesListSchema.safeParseAsync(audiences);
    if (!parsedNonEmptyAudiencesList.success) {
      throw new TypeError("Invalid token audience(s) in audiences array!", {
        cause: parsedNonEmptyAudiencesList.error
      });
    }
  }

  if (debug) {
    console.log(
      `[validateAudience] Attempting to validate audiences (from user '${uid}' on client app '${client_app_id}'): `,
      audience,
    );
  }

  if (new Set(audiences).size !== audiences.length) {
    throw new Error("All audiences must be unique in the request");
  }

  const isAuthorized: boolean = await isAppAuthorizedForUser(
    dbh.db,
    uid,
    client_app_id,
    debug
  );
  if (!isAuthorized) {
    throw new ClientApplicationNotAuthorizedByUser(
      `Client application '${client_app_id}' is not authorized by user '${uid}'`
    )
  }

  if (isEmptyAudienceList) {
    return { ok: true, resolved: [] };
  }

  const client_app: SchemaVaultsApp | null = await getApp(
    dbh.db,
    client_app_id,
    debug,
  );
  if (!client_app) {
    console.error(
      `[validateAudience] Client application '${client_app_id}' does not exist`,
    );
    return { ok: false };
  }

  const resolved: ResolvedTokenAudience[] = await Promise.all(
    audiences.map(
      (aud: string): Promise<ResolvedTokenAudience> =>
        resolveTokenAudience(dbh.db, aud, environment, debug),
    ),
  );

  const validateOneAudiencePromises: readonly Promise<ValidateAudienceOutput>[] =
    resolved.map(
      (one: ResolvedTokenAudience): Promise<ValidateAudienceOutput> =>
        validateOneAudience(client_app, one, dbh, debug),
    );
  const validationResults = await Promise.all(validateOneAudiencePromises);

  if (validationResults.some((result) => !result)) {
    console.error("One or more of token audiences is not allowed");
    return { ok: false };
  }

  if (
    validationResults.some(function isValidationResultInvalid(
      result: ValidateAudienceOutput,
    ): boolean {
      return typeof result === "string"
        ? result === "auth-server-only" && client_app_id !== auth_app_id
        : false;
    })
  ) {
    console.error(
      "Some of the audiences for access tokens can only be requested from a hardcoded first-party app",
    );
    return { ok: false };
  }

  return { ok: true, resolved };
}

/**
 * @description Boolean form of {@link validateAndResolveAudiences} for the
 * platform's login/token flows. A resource URL that cannot be resolved to
 * an API server is reported as not allowed (rather than thrown).
 */
export async function validateAudience(
  uid: string,
  client_app_id: AppId,
  audience: string | readonly string[],
  dbh: ServerlessDatabase,
  environment: SchemaVaultsAppEnvironment,
  debug: boolean = shouldEnableDebug(),
): Promise<boolean> {
  try {
    const result = await validateAndResolveAudiences(
      uid,
      client_app_id,
      audience,
      dbh,
      environment,
      debug,
    );
    return result.ok;
  } catch (e: unknown) {
    if (e instanceof UnresolvableTokenResourceError) {
      console.error(`[validateAudience] ${e.message}`);
      return false;
    }
    throw e;
  }
}

export default validateAudience;
