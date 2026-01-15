import "server-only";

import AdminUsersPageView from "./admin_users_page_view";
import type { ReactElement } from "react";
import {
  type ProtectedAdminPageProps,
  withAdminRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { cookies } from "next/headers";
import { ServerlessDatabase, UserRegistry, type UserDocument } from "@/lib/auth-db";
import type { ServerRuntime } from "next";
import type { UserData } from "@schemavaults/auth-common";

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
}: ProtectedAdminPageProps): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!",
    );
  }

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  const registry = new UserRegistry(dbh.db);

  const userDocs: readonly UserDocument[] = await registry.listAllUsers();
  const users: readonly UserData[] = userDocs.map(userDocumentToUserData);

  return <AdminUsersPageView preloaded={users} />;
}

async function UsersServerComponent(): Promise<ReactElement> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  return await withAdminRouteGuard({
    ProtectedAdminPageServerComponent: PreloadedUsersPage,
    cookies: await cookies(),
    dbh,
  });
}

export default UsersServerComponent;

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";