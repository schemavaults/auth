import "server-only";
import type { ReactElement } from "react";

import LoginOrRegisterForm from "../LoginOrRegisterForm";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import determineOnSuccessfulAuthenticateAction from "../determineOnSuccessfulAuthenticateAction";
import type { ServerRuntime } from "next/types";
import type { UserData } from "@schemavaults/auth-common";
import { doesSsrContextHaveValidAuthServerRefreshToken } from "@/lib/doesRequestHaveValidAuthServerRefreshToken";
import { redirect } from "next/navigation";
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import redirectWithError from "@/lib/redirect-with-error";
import { ServerlessDatabase } from "@/lib/auth-db";
import { isAppAuthorizedForUser } from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import { generateAuthorizationCode } from "@/lib/auth-db/users/generate-authorization-code";
import { AppAuthorizationConsentScreen } from "@/components/AppAuthorizationConsentScreen";

export default async function LoginPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<ReactElement> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  const searchParams = await props.searchParams;

  const { action: on_successful_authenticate, app } =
    await determineOnSuccessfulAuthenticateAction({
      searchParams,
      debug,
    });

  const alreadyAuthenticated: UserData | false = await doesSsrContextHaveValidAuthServerRefreshToken();
  if (alreadyAuthenticated) {
    if (on_successful_authenticate === 'account-page') {
      return redirect("/account");
    }

    if (app) {
      await using dbh = ServerlessDatabase.createDBH();
      const isAuthorized = await isAppAuthorizedForUser(dbh.db, alreadyAuthenticated.uid, app.app_id, debug);

      if (isAuthorized) {
        // App already authorized — generate auth code server-side and redirect immediately
        const code_challenge = typeof searchParams.code_challenge === 'string' ? searchParams.code_challenge : null;
        const challenge_time_str = typeof searchParams.challenge_time === 'string' ? searchParams.challenge_time : null;
        const redirect_uri = typeof searchParams.redirect_uri === 'string' ? searchParams.redirect_uri : null;

        if (!code_challenge || !challenge_time_str) {
          redirectWithError(400, "bad_request");
        }

        const challenge_time = parseInt(challenge_time_str);
        if (isNaN(challenge_time)) {
          redirectWithError(400, "bad_request");
        }

        const authorization_code = await generateAuthorizationCode(
          dbh.db,
          alreadyAuthenticated.uid,
          code_challenge,
          "S256",
          challenge_time,
          debug,
        );

        if (on_successful_authenticate === "redirect-with-authorization-code") {
          if (!redirect_uri) {
            redirectWithError(400, "bad_request");
          }
          const queryParams = new URLSearchParams();
          queryParams.set('challenge_time', challenge_time.toString());
          queryParams.set('code_challenge_method', 'S256');
          queryParams.set('authorization_code', authorization_code);
          return redirect(`${redirect_uri}?${queryParams.toString()}`);
        } else if (on_successful_authenticate === "send-authorization-code-to-native-app-then-close") {
          if (!redirect_uri) {
            redirectWithError(400, "bad_request");
          }
          // POST the code to the native app's redirect_uri
          const postResponse = await fetch(redirect_uri, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code_challenge_method: "S256",
              challenge_time: challenge_time.toString(),
              authorization_code,
            }),
          });
          if (postResponse.status !== 200) {
            redirectWithError(502, "internal_server_error");
          }
          return redirect("/close_window");
        }
      }

      // App NOT authorized — show consent screen
      return (
        <AppAuthorizationConsentScreen
          app_id={app.app_id}
          app_name={app.app_name}
          app_description={app.app_description}
          onSuccessfulAuthenticate={on_successful_authenticate}
          mode="authorize-and-redirect"
          debug={debug}
        />
      );
    }
  }

  await using dbh = ServerlessDatabase.createDBH();

  let inviteCodeRequired: boolean
  try {
    inviteCodeRequired = await inviteCodesRequired(dbh.db);
  } catch (e: unknown) {
    console.error("Failed to load server config setting on whether invite codes are required: ", e);
    redirectWithError(500, "load_server_config_failure");
  }

  return (
    <LoginOrRegisterForm
      type={"login"}
      onSuccessfulAuthenticate={on_successful_authenticate}
      invite_code_required={inviteCodeRequired}
      debug={debug}
      app={app ? { app_id: app.app_id, app_name: app.app_name, app_description: app.app_description } : null}
    />
  );
}

export const runtime: ServerRuntime = "edge";
