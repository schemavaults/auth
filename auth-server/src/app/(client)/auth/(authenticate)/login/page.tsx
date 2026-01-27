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
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import type { UserData } from "@schemavaults/auth-common";
import { doesSsrContextHaveValidRefreshToken } from "@/lib/doesRequestHaveValidRefreshToken";
import { redirect } from "next/navigation";
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import redirectWithError from "@/lib/redirect-with-error";
import { ServerlessDatabase } from "@/lib/auth-db";

export default async function LoginPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<ReactElement> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  const searchParams = await props.searchParams;

  const on_successful_authenticate: OnSuccessfulAuthenticateAction =
    await determineOnSuccessfulAuthenticateAction({
      searchParams,
      debug,
    });

  const alreadyAuthenticated: UserData | false = await doesSsrContextHaveValidRefreshToken();
  if (alreadyAuthenticated) {
    if (on_successful_authenticate === 'account-page') {
      return redirect("/account");
    }
  }

  await using dbh = ServerlessDatabase.createDBH();

  let inviteCodeRequired: boolean
  try {
    inviteCodeRequired = await inviteCodesRequired(dbh.db);
  } catch (e: unknown) {
    redirectWithError(500, "load_server_config_failure");
  }

  return (
    <LoginOrRegisterForm
      type={"login"}
      onSuccessfulAuthenticate={on_successful_authenticate}
      invite_code_required={inviteCodeRequired}
      debug={debug}
    />
  );
}

export const runtime: ServerRuntime = "edge";
