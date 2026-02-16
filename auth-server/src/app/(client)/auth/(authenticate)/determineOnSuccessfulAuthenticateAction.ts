import { SchemaVaultsAppRegistry, ServerlessDatabase } from "@/lib/auth-db";
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import redirectWithError from "@/lib/redirect-with-error";
import {
  type AppId,
  appIdSchema,
  type SchemaVaultsApp,
} from "@schemavaults/app-definitions";
import isValidOnSuccessfulAuthenticateAction from "./isValidOnSuccessfulAuthenticateAction";

export interface IDetermineOnSuccessfulAuthenticateActionInputs {
  searchParams: {
    [key: string]: string | string[] | undefined;
  };
  debug: boolean;
}

export interface DetermineOnSuccessfulAuthenticateActionResult {
  action: OnSuccessfulAuthenticateAction;
  app: SchemaVaultsApp | null;
}

export async function determineOnSuccessfulAuthenticateActionMightThrow({
  searchParams,
  debug,
}: IDetermineOnSuccessfulAuthenticateActionInputs): Promise<DetermineOnSuccessfulAuthenticateActionResult> {
  let on_successful_authenticate: OnSuccessfulAuthenticateAction | undefined =
    undefined;

  // Get the appId from the query parameters -- this is the app that the user is trying to authenticate with
  const app_id = searchParams.app_id;
  if (
    !app_id ||
    typeof app_id !== "string" ||
    !appIdSchema.safeParse(app_id).success
  ) {
    on_successful_authenticate = "account-page";

    // If an app ID was not provided, expect some other params to not be set
    if (
      searchParams.redirect_uri ||
      searchParams.code_challenge ||
      searchParams.code_challenge_method ||
      searchParams.challenge_time
    ) {
      throw new Error("Cannot pass PKCE params when app_id is not set");
    }
  } else {
    if (debug) {
      console.log(
        "[SchemaVaultsAuthRouteServerRouter] App ID:",
        app_id satisfies AppId,
      );
    }
  }

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  let app: SchemaVaultsApp | undefined = undefined;
  if (
    on_successful_authenticate !== "account-page" &&
    typeof app_id === "string"
  ) {
    try {
      const registry = new SchemaVaultsAppRegistry(dbh.db);
      const loadAppQuery = await registry.getApp(app_id);
      if (!loadAppQuery) {
        if (debug) {
          console.error(
            "[SchemaVaultsAuthServer] Frontend client application not found with app_id: ",
            app_id,
          );
        }
        throw new Error(
          "Frontend client application not found with that 'app_id'",
        );
      }
      app = loadAppQuery;
      if (debug) {
        console.log("[SchemaVaultsAuthRouteServerRouter] App found:", app);
      }
    } catch (e: unknown) {
      console.error(
        `[SchemaVaultsAuthRouteServerRouter] Failed to load app with ID "${app_id}".`,
      );
      if (debug) console.error(e);
      redirectWithError(404, "app_id_not_found");
    }
    console.assert(!!app);
    if (!app) throw new Error("Failed to load frontend application definition");
  } // app now contains the app that the user is trying to authenticate with

  if (app) {
    if (app.web) {
      on_successful_authenticate = "redirect-with-authorization-code";
    } else {
      on_successful_authenticate =
        "send-authorization-code-to-native-app-then-close";
    }
  }

  if (
    !on_successful_authenticate ||
    !isValidOnSuccessfulAuthenticateAction(on_successful_authenticate)
  ) {
    redirectWithError(500, "internal_server_error");
  }

  return {
    action: on_successful_authenticate satisfies OnSuccessfulAuthenticateAction,
    app: app ?? null,
  };
}

export async function determineOnSuccessfulAuthenticateAction(
  inputs: IDetermineOnSuccessfulAuthenticateActionInputs,
): Promise<DetermineOnSuccessfulAuthenticateActionResult> {
  try {
    return await determineOnSuccessfulAuthenticateActionMightThrow(inputs);
  } catch (e: unknown) {
    console.error(
      "Error determining action to undertake when authentication is successful: ",
      e,
    );
    redirectWithError(500, "internal_server_error");
  }
}

export default determineOnSuccessfulAuthenticateAction;
