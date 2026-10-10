import "server-only";

import AdminClientErrorDetailPageView from "./admin_client_error_detail_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import redirectWithError from "@/lib/redirect-with-error";
import reportServerException from "@/lib/reportServerException";
import type { ServerRuntime } from "next";
import { type ClientErrorRow, getClientErrorById } from "@/lib/auth-db/client-errors";
import { z } from "zod";
import { connection } from "next/server";

const clientErrorIdSchema = z.guid();

async function PreloadedAdminClientErrorDetailPage(
  { user, dbh }: IProtectedAdminServerComponentPageProps,
  pageParams: PageProps<"/admin/client-errors/[client_error_id]">,
): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error("Expected user to have been asserted to be an admin by this point!");
  }

  const { client_error_id: param } = await pageParams.params;
  const parsed = clientErrorIdSchema.safeParse(param);
  if (!parsed.success) {
    redirectWithError(400, "bad_request");
  }

  let row: ClientErrorRow | null = null;
  try {
    row = await getClientErrorById(dbh.db, parsed.data);
  } catch (e: unknown) {
    console.error(`[AdminClientErrorDetailPage] Failed to load client error '${parsed.data}': `, e);
    await reportServerException(e, {
      op_name: "AdminClientErrorDetailPage.getClientErrorById",
      route: "/admin/client-errors/[client_error_id]",
      uid: user.uid,
      context: { client_error_id: parsed.data },
    });
    redirectWithError(500, "internal_server_error");
  }

  if (!row) {
    redirectWithError(400, "bad_request");
  }

  return <AdminClientErrorDetailPageView clientError={row} />;
}

export default async function AdminClientErrorDetailPage(
  pageParams: PageProps<"/admin/client-errors/[client_error_id]">,
): Promise<ReactElement> {
  await connection();
  const { client_error_id } = await pageParams.params;
  // Only forward a next_href for a well-formed id; a malformed one would 400 after login anyway.
  const parsed = clientErrorIdSchema.safeParse(client_error_id);
  return await withAdminServerComponentRouteGuard(
    (props) => PreloadedAdminClientErrorDetailPage(props, pageParams),
    parsed.success ? { next_href: `/admin/client-errors/${parsed.data}` } : undefined,
  );
}

export const runtime: ServerRuntime = "nodejs";
