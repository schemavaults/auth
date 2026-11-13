import "server-only";
import type { ReactElement } from "react";

import AccountAuditLogPageView from "./account-audit-log-page-view";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import type { AuditLogPage } from "@/lib/audit-log/audit-log-entry-schema";
import loadFirstAuditLogPage from "@/lib/audit-log/load-audit-log-page";
import reportServerException from "@/lib/reportServerException";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

async function AccountAuditLogPageServerComponent(
  { user, dbh }: IProtectedAuthenticatedServerComponentPageProps,
): Promise<ReactElement> {
  if (!user) {
    // allow typescript to see that user data is set
    throw new Error(
      "This should be unreachable code-- redirectWithError seems to not have worked!",
    );
  }

  // On preload failure the card loads GET /api/me/audit-log client-side.
  let preloaded: AuditLogPage | undefined;
  try {
    preloaded = await loadFirstAuditLogPage(dbh.db, { uid: user.uid });
  } catch (e: unknown) {
    console.error("Failed to preload the account audit log:", e);
    await reportServerException(e, {
      op_name: "AccountAuditLogPage.preloadAuditLog",
      route: "/account/audit-log",
      uid: user.uid,
      context: { nonFatal: true },
    });
  }

  return <AccountAuditLogPageView viewer_uid={user.uid} preloaded={preloaded} />;
}

export default async function AccountAuditLogPage(): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(
    AccountAuditLogPageServerComponent,
    { next_href: "/account/audit-log" },
  );
}

export const runtime: ServerRuntime = "nodejs";
