import "server-only";
import type { ReactElement } from "react";
import type { ServerRuntime } from "next/types";
import { connection } from "next/server";
import { ServerlessDatabase } from "@/lib/auth-db/serverless-database";
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import redirectWithError from "@/lib/redirect-with-error";
import HelpPageView from "./HelpPageView";

export default async function HelpPage(): Promise<ReactElement> {
  await connection();
  await using dbh = ServerlessDatabase.createDBH();

  let inviteCodeRequired: boolean;
  try {
    inviteCodeRequired = await inviteCodesRequired(dbh.db);
  } catch (e: unknown) {
    console.error(
      "Failed to load server setting for invite_code_required on help page: ",
      e,
    );
    redirectWithError(500, "load_server_config_failure");
  }

  return <HelpPageView invite_code_required={inviteCodeRequired} />;
}

export const runtime: ServerRuntime = "nodejs";
