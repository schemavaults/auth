import "server-only";

import InviteCodesPageView from "./invite_codes_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { UserRegistry } from "@/lib/auth-db/users/user-registry";
import { InviteCodeDefinition } from "@schemavaults/auth-common";
import { ServerRuntime } from "next";

async function PreloadedInviteCodesPage({
  user,
  dbh
}: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!",
    );
  }

  const registry = new UserRegistry(dbh.db);

  const invite_codes: readonly InviteCodeDefinition[] =
    await registry.listAllInviteCodes();

  return <InviteCodesPageView preloaded={invite_codes} />;
}

export default async function InviteCodesServerComponent(): Promise<ReactElement> {
  return await withAdminServerComponentRouteGuard(PreloadedInviteCodesPage);
}

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";
