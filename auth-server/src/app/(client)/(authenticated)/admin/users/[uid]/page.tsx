import "server-only";

import AdminUserDetailPageView from "./admin_user_detail_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { UserRegistry, loadUserData } from "@/lib/auth-db";
import redirectWithError from "@/lib/redirect-with-error";
import type { ServerRuntime } from "next";
import { z } from "zod";
import type { UserData } from "@schemavaults/auth-common";
import { connection } from "next/server";

interface PageParams {
  params: Promise<{ uid: string }>;
}

const uidSchema = z.string().uuid();

async function PreloadedAdminUserDetailPage(
  { user, dbh }: IProtectedAdminServerComponentPageProps,
  pageParams: PageParams,
): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!",
    );
  }

  const { uid: uid_param } = await pageParams.params;
  const parsed_uid = await uidSchema.safeParseAsync(uid_param);
  if (!parsed_uid.success) {
    redirectWithError(400, "bad_request");
  }
  const uid: string = parsed_uid.data;

  const registry = new UserRegistry(dbh.db);
  let targetUser: UserData;
  try {
    targetUser = await loadUserData(uid, registry);
  } catch (e: unknown) {
    console.error(
      `[AdminUserDetailPage] Failed to load user '${uid}': `,
      e,
    );
    redirectWithError(400, "bad_request");
  }

  return <AdminUserDetailPageView user={targetUser} sessionUid={user.uid} />;
}

export default async function AdminUserDetailPage(
  pageParams: PageParams,
): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard((props) =>
    PreloadedAdminUserDetailPage(props, pageParams),
  );
}

export const runtime: ServerRuntime = "nodejs";
