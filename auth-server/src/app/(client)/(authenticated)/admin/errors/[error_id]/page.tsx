import "server-only";

import AdminErrorDetailPageView from "./admin_error_detail_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import redirectWithError from "@/lib/redirect-with-error";
import type { ServerRuntime } from "next";
import type { ErrorRow } from "@/lib/auth-db/errors";
import { z } from "zod";
import { connection } from "next/server";

const errorIdSchema = z.string().uuid();

async function PreloadedAdminErrorDetailPage(
  { user, dbh }: IProtectedAdminServerComponentPageProps,
  pageParams: PageProps<"/admin/errors/[error_id]">,
): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!",
    );
  }

  const { error_id: error_id_param } = await pageParams.params;
  const parsed = await errorIdSchema.safeParseAsync(error_id_param);
  if (!parsed.success) {
    redirectWithError(400, "bad_request");
  }
  const error_id: string = parsed.data;

  let errorRow: ErrorRow | undefined;
  try {
    errorRow = await dbh.db
      .selectFrom("errors")
      .selectAll()
      .where("error_id", "=", error_id)
      .executeTakeFirst();
  } catch (e: unknown) {
    console.error(
      `[AdminErrorDetailPage] Failed to load error '${error_id}': `,
      e,
    );
    redirectWithError(500, "internal_server_error");
  }

  if (!errorRow) {
    redirectWithError(400, "bad_request");
  }

  return <AdminErrorDetailPageView errorRow={errorRow} />;
}

export default async function AdminErrorDetailPage(
  pageParams: PageProps<"/admin/errors/[error_id]">,
): Promise<ReactElement> {
  await connection();
  const { error_id } = await pageParams.params;
  return await withAdminServerComponentRouteGuard(
    (props) => PreloadedAdminErrorDetailPage(props, pageParams),
    { next_href: `/admin/errors/${encodeURIComponent(error_id)}` },
  );
}

export const runtime: ServerRuntime = "nodejs";
