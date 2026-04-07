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
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import redirectWithError from "@/lib/redirect-with-error";
import { isPkceChallengeExpired } from "@schemavaults/auth-common/pkce/is_pkce_challenge_expired.js";
import { ServerlessDatabase } from "@/lib/auth-db";
import validateAppIdSearchParamOrRedirectWithError from "../validateAppIdSearchParamOrRedirectWithError";
import AlreadyAuthenticatedOnLoginOrRegisterPage from "../AlreadyAuthenticatedOnLoginOrRegisterPage";
import toPartialAppInfo from "@/lib/PartialAppInfo";
import { connection } from "next/server";

export default async function LoginPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<ReactElement> {
  await connection();

  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  const searchParams = await props.searchParams;
  validateAppIdSearchParamOrRedirectWithError(searchParams.app_id)

  await using dbh = ServerlessDatabase.createDBH();

  const { action: on_successful_authenticate, app } =
    await determineOnSuccessfulAuthenticateAction({
      dbh,
      searchParams,
      debug,
    });

  if (on_successful_authenticate !== 'account-page') {
    const challenge_time_str = searchParams.challenge_time;
    if (typeof challenge_time_str === 'string') {
      const challenge_time = parseInt(challenge_time_str);
      if (!isNaN(challenge_time) && isPkceChallengeExpired(challenge_time)) {
        redirectWithError(400, "pkce_challenge_expired");
      }
    }
  }

  if (on_successful_authenticate !== 'account-page' && !app) {
    console.error("Failed to load app definition despite 'on_successful_authenticate' of: ", on_successful_authenticate);
    redirectWithError(500, "internal_server_error");
  }

  const alreadyAuthenticated: UserData | false = await doesSsrContextHaveValidAuthServerRefreshToken();
  if (alreadyAuthenticated) {
    return await AlreadyAuthenticatedOnLoginOrRegisterPage({
      dbh,
      app,
      on_successful_authenticate,
      uid: alreadyAuthenticated.uid,
      code_challenge: typeof searchParams.code_challenge === 'string' ? searchParams.code_challenge : null,
      code_challenge_method: typeof searchParams.code_challenge_method === 'string' ? searchParams.code_challenge_method : null,
      challenge_time_str: typeof searchParams.challenge_time === 'string' ? searchParams.challenge_time : null,
      redirect_uri: typeof searchParams.redirect_uri === 'string' ? searchParams.redirect_uri : null,
      debug
    });
  }

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
      app={app ? toPartialAppInfo(app) : null}
    />
  );
}

export const runtime: ServerRuntime = "nodejs";
