import {
  type ServerlessDatabase,
  SchemaVaultsAppToApiPermissionsRegistry,
} from "@/lib/auth-db";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  type ApiServerId,
  apiServerIdSchema,
  type AppId,
  appIdSchema,
  getApiServerIdForTokenAudience,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import { createAudienceSchema } from "@schemavaults/auth-common";
import isValidUuid from "@/lib/is-valid-uuid";
import ClientApplicationNotAuthorizedByUser from "@/lib/error/ClientApplicationNotAuthorizedByUser";
import AppNotConnectedToApiServerError from "@/lib/error/AppNotConnectedToApiServerError";
import { z } from "zod";

export type ValidateAudienceOutput =
  | "auth-server-only"
  | "api-resource-server"
  | false;

async function validateOneAudience(
  uid: string,
  client_app_id: string,
  audience: string,
  dbh: ServerlessDatabase,
  environment: SchemaVaultsAppEnvironment,
  debug: boolean = false,
  auth_app_id: string = getAuthServerAppId(),
): Promise<ValidateAudienceOutput> {
  const audienceSchema = createAudienceSchema(z, environment);

  if (
    typeof uid !== "string" ||
    typeof client_app_id !== "string" ||
    typeof audience !== "string"
  ) {
    throw new TypeError("Expected 'uid', 'client_app_id', and 'audience' arguments to be strings");
  }

  // Tokens for the auth server carry the (white-labellable) auth server URL
  // as their audience; translate back to the stable app id before comparing.
  // The bare app id form is also accepted for backwards compatibility.
  if (
    audience === auth_app_id ||
    getApiServerIdForTokenAudience(audience, environment) ===
      auth_app_id
  ) {
    return "auth-server-only";
  }

  console.assert(
    audience !== auth_app_id,
    `Expected this to be a non-auth server API server if this point was reached`
  );



  const parsed_aud = await audienceSchema.safeParseAsync(audience);
  const isSemanticallyValidAudience = parsed_aud.success satisfies boolean;
  if (!isSemanticallyValidAudience || !parsed_aud.data) {
    console.error(
      `[validateAudience] Invalid audience ref. ` +
        `Instead received: "${audience}"`,
      parsed_aud.error,
    );
    return false;
  }

  const aud: string = parsed_aud.data;

  if (aud === auth_app_id) {
    return "auth-server-only";
  } else if (apiServerIdSchema.safeParse(aud).success) {
    // pass
  } else {
    console.error("Not prepared to handle audience: ", aud);
    throw new Error("Unhandled audience reference type!");
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

export async function validateAudience(
  uid: string,
  client_app_id: AppId,
  audience: string | readonly string[],
  dbh: ServerlessDatabase,
  environment: SchemaVaultsAppEnvironment,
  debug: boolean = shouldEnableDebug(),
): Promise<boolean> {
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

  // An explicitly empty audience list means the grant mints no access
  // tokens (login/refresh-rotation only — e.g. a client app configured with
  // no default token audiences). There are no audiences to validate, but the
  // client app must still be authorized by the user.
  const isEmptyAudienceList: boolean = audiences.length === 0;

  // Audiences arrive in token-audience form (the auth server URL, or an api
  // server id verbatim); the bare auth app id is also tolerated for backwards
  // compatibility.
  const singleAudienceSchema = z.union([
    createAudienceSchema(z, environment),
    z.literal(auth_app_id),
  ]);
  if (!isEmptyAudienceList && !(await singleAudienceSchema.array().min(1, "Audiences array must be non-empty").max(16, "Cannot request more than 16 access tokens at once").safeParseAsync(audiences)).success) {
    throw new TypeError("Invalid token audience(s) in audiences array!")
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
    throw new ClientApplicationNotAuthorizedByUser(`Client application '${client_app_id}' is not authorized by user '${uid}'`)
  }

  if (isEmptyAudienceList) {
    return true;
  }

  const validateOneAudiencePromises: readonly Promise<ValidateAudienceOutput>[] = audiences.map(
    (audience: string): Promise<ValidateAudienceOutput> =>
      validateOneAudience(uid, client_app_id, audience, dbh, environment, debug, auth_app_id),
  );
  const validationResults = await Promise.all(validateOneAudiencePromises);

  if (validationResults.some((result) => !result)) {
    console.error("One or more of token audiences is not allowed");
    return false;
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
    return false;
  }

  return true;
}

export default validateAudience;
