import "server-only";

import AdminUserDetailPageView from "./admin_user_detail_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { UserRegistry, type UserDocument } from "@/lib/auth-db";
import redirectWithError from "@/lib/redirect-with-error";
import type { ServerRuntime } from "next";
import { z } from "zod";
import type { UserData } from "@schemavaults/auth-common";
import { connection } from "next/server";

interface PageParams {
  params: Promise<{ uid: string }>;
}

const uidSchema = z.string().uuid();

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
  const userDoc: UserDocument | null = await registry.getUserByUID(uid);
  if (!userDoc) {
    redirectWithError(404, "bad_request");
  }

  const targetUser: UserData = userDocumentToUserData(userDoc);

  return <AdminUserDetailPageView user={targetUser} />;
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
