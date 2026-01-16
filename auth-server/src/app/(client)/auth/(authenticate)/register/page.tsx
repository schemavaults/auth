import "server-only";
import type { ReactElement } from "react";

import LoginOrRegisterForm from "../LoginOrRegisterForm";
import determineOnSuccessfulAuthenticateAction from "../determineOnSuccessfulAuthenticateAction";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { ServerRuntime } from "next/types";
import type { OnSuccessfulAuthenticateAction } from "@/lib/authentication_outcome_type";
import type { UserData } from "@schemavaults/auth-common";
import { doesSsrContextHaveValidRefreshToken } from "@/lib/doesRequestHaveValidRefreshToken";
import { redirect } from "next/navigation";

export default async function RegisterPage(props: {
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

  return (
    <LoginOrRegisterForm
      type={"register"}
      onSuccessfulAuthenticate={on_successful_authenticate}
      debug={debug}
    />
  );
}

export const runtime: ServerRuntime = "edge";
