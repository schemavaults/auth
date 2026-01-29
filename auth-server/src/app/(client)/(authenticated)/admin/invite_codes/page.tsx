import "server-only";

import InviteCodesPageView from "./invite_codes_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { UserRegistry } from "@/lib/auth-db/users/user-registry";
import type { InviteCodeDefinition } from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

async function PreloadedInviteCodesPage({
  user,
  dbh
}: IProtectedAdminServerComponentPageProps<AuthDatabase>): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!",
    );
  }

  const registry = new UserRegistry(dbh.db);

  let invite_codes: readonly InviteCodeDefinition[]
  try {
    invite_codes = await registry.listAllInviteCodes();
  } catch (e: unknown) {
    console.error("Error listing invite codes:", e)
   throw new Error("Error listing invite codes in server component!")
  }

  return <InviteCodesPageView preloaded={invite_codes} />;
}

export default async function InviteCodesServerComponent(): Promise<ReactElement> {
  return await withAdminServerComponentRouteGuard(PreloadedInviteCodesPage);
}

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";
