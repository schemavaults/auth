import "server-only";

import AdminUsersPageView from "./admin_users_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { UserRegistry, type UserDocument } from "@/lib/auth-db";
import type { ServerRuntime } from "next";
import type { UserData } from "@schemavaults/auth-common";
import { connection } from "next/server";

function userDocumentToUserData(doc: UserDocument): UserData {
  return {
    uid: doc.uid,
    sub: doc.uid,
    email: doc.email,
    email_verified: doc.email_verified,
    admin: doc.admin,
    disabled: doc.disabled,
    created_at: doc.created_at,
    invite_code: doc.invite_code,
  };
}

async function PreloadedUsersPage({
  user,
  dbh
}: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!",
    );
  }

  const registry = new UserRegistry(dbh.db);

  const userDocs: readonly UserDocument[] = await registry.listAllUsers();
  const users: readonly UserData[] = userDocs.map(userDocumentToUserData);

  return <AdminUsersPageView preloaded={users} />;
}

export default async function UsersAdminPageServerComponent(): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard(PreloadedUsersPage);
}

export const runtime: ServerRuntime = "nodejs";
