import {
  AuthorizedAppsRegistry,
  type ServerlessDatabase,
  SchemaVaultsAppToApiPermissionsRegistry,
} from "@/lib/auth-db";
import isPrivateBeta from "@/lib/private-beta";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  apiServerIdSchema,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
} from "@schemavaults/app-definitions";
import { audienceRefSchema } from "@schemavaults/auth-common";

export type ValidateAudienceOutput =
  | "auth-server-only"
  | "api-resource-server"
  | false;

async function validateOneAudience(
  uid: string,
  client_app_id: string,
  audience: string,
  dbh: ServerlessDatabase,
  debug: boolean = false,
): Promise<ValidateAudienceOutput> {
  if (
    typeof uid !== "string" ||
    typeof client_app_id !== "string" ||
    typeof audience !== "string"
  ) {
    throw new Error("Expected all arguments to be strings");
  }
  if (
    client_app_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id &&
    audience === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id
  ) {
    return "auth-server-only";
  } else if (audience === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
    return "auth-server-only";
  }

  const parsed_aud = await audienceRefSchema.safeParseAsync(audience);
  const isSemanticallyValidAudience = parsed_aud.success satisfies boolean;
  if (!isSemanticallyValidAudience || !parsed_aud.data) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        `[validateAudience] Invalid audience ref. ` +
          `Instead received: \"${audience}\"`,
        parsed_aud.error,
      );
    }
    return false;
  } else {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[validateAudience] Audience appears semantically valid: `,
        parsed_aud.data,
      );
    }
  }

  const aud: string = parsed_aud.data;

  let audienceType: "fs" | "api" | "auth";
  if (aud.startsWith("schemavaults-fs:")) {
    audienceType = "fs";
  } else if (aud === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
    audienceType = "auth";
    return "auth-server-only";
  } else if (apiServerIdSchema.safeParse(aud).success) {
    audienceType = "api";
  } else {
    console.error("Not prepared to handle audience: ", aud);
    throw new Error("Unhandled audience reference type!");
  }

  if (audienceType === "fs") {
    console.warn(
      "TODO: Validate whether access should be granted to the FS server here!!! Do they have enough credits to read/write?? Is this a public storage region??",
    );
    if (!isPrivateBeta()) {
      throw new Error("This implementation is not suitable for public access!");
    }

    return "api-resource-server";
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
      return false;
    }
  } catch (e: unknown) {
    console.error(
      "Failed to check if frontend application has permission to access API server: ",
      e,
    );
    return false;
  }

  return "api-resource-server";
}

async function validateFrontendAppAuthorizedByUser(
  uid: string,
  client_app_id: string,
  dbh: ServerlessDatabase,
): Promise<boolean> {
  // Validate that the user has authorized frontend client app with id client_app_id
  try {
    const authorizedAppsRegistry = new AuthorizedAppsRegistry(dbh.db);
    const isAuthorized: boolean =
      await authorizedAppsRegistry.isAppAuthorizedForUser(uid, client_app_id);
    if (!isAuthorized) {
      return false;
    }
    return true;
  } catch (e: unknown) {
    console.error(
      "Failed to check if user has authorized client application: ",
      e,
    );
    return false;
  }
}

export async function validateAudience(
  uid: string,
  client_app_id: string,
  audience: string | readonly string[],
  dbh: ServerlessDatabase,
  debug: boolean = shouldEnableDebug(),
): Promise<boolean> {
  if (debug) {
    console.log(
      `[validateAudience] Attempting to validate audiences (from user '${uid}' on client app '${client_app_id}'): `,
      audience,
    );
  }

  if (typeof audience === "undefined" || !audience) {
    throw new Error("Did not receive an audience to validate!");
  }

  const audiences: string[] = Array.isArray(audience) ? audience : [audience];

  console.assert(
    Array.isArray(audiences) &&
      audiences.every((aud) => typeof aud === "string"),
    "Expected 'audiences' to be an array of strings if this point was reached!",
  );

  if (audiences.length > 16) {
    throw new Error("Cannot request more than 16 access tokens at once");
  }

  if (new Set(audiences).size !== audiences.length) {
    throw new Error("All audiences must be unique in the request");
  }

  const isAuthorized = await validateFrontendAppAuthorizedByUser(
    uid,
    client_app_id,
    dbh,
  );
  if (!isAuthorized) {
    throw new Error("Frontend app is not authorized by user");
  }

  const validateOneAudiencePromises = audiences.map(
    (audience: string): Promise<ValidateAudienceOutput> =>
      validateOneAudience(uid, client_app_id, audience, dbh, debug),
  );
  const validationResults = await Promise.all(validateOneAudiencePromises);

  if (validationResults.some((result) => !result)) {
    console.error("One or more of token audiences is not allowed");
    return false;
  }

  const isThisAuthServer: boolean =
    client_app_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id;

  if (
    validationResults.some(function isValidationResultInvalid(
      result: ValidateAudienceOutput,
    ): boolean {
      return typeof result === "string"
        ? result === "auth-server-only" && !isThisAuthServer
        : false;
    })
  ) {
    console.error(
      "Some of the audiences for access tokens can only be requested from the auth server",
    );
    return false;
  }

  return true;
}
