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

  return (
    <LoginOrRegisterForm
      type={"login"}
      onSuccessfulAuthenticate={on_successful_authenticate}
    />
  );
}

export const runtime: ServerRuntime = "edge";
