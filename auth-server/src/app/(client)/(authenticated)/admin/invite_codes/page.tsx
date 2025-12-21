import "server-only";

import InviteCodesPageView from "./invite_codes_page_view";
import type { ReactElement } from "react";
import {
  type ProtectedAdminPageProps,
  withAdminRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { cookies } from "next/headers";
import { ServerlessDatabase, UserRegistry } from "@/lib/auth-db";
import { InviteCodeDefinition } from "@schemavaults/auth-common";
import { ServerRuntime } from "next";

async function PreloadedInviteCodesPage({
  user,
}: ProtectedAdminPageProps): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!",
    );
  }

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  const registry = new UserRegistry(dbh.db);

  const invite_codes: readonly InviteCodeDefinition[] =
    await registry.listAllInviteCodes();

  return <InviteCodesPageView preloaded={invite_codes} />;
}

async function InviteCodesServerComponent(): Promise<ReactElement> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  return await withAdminRouteGuard({
    ProtectedAdminPageServerComponent: PreloadedInviteCodesPage,
    cookies: await cookies(),
    dbh,
  });
}

export default InviteCodesServerComponent;

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";
