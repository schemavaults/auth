import "server-only";
import type { ReactElement } from "react";

import ConnectedAppsPageView from "./connected-apps-page-view";
import type { ConnectedApp } from "@schemavaults/auth-common";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { listConnectedAppsForUser } from "@/lib/auth-db/api-scope-consents";
import reportServerException from "@/lib/reportServerException";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

async function AuthServerConnectedAppsPageServerComponent(
  { user, dbh }: IProtectedAuthenticatedServerComponentPageProps,
): Promise<ReactElement> {
  if (!user) {
    // allow typescript to see that user data is set
    throw new Error(
      "This should be unreachable code-- redirectWithError seems to not have worked!",
    );
  }

  // On preload failure the card loads GET /api/me/connected-apps client-side.
  let preloaded: ConnectedApp[] | undefined;
  try {
    preloaded = await listConnectedAppsForUser(dbh.db, user.uid);
  } catch (e: unknown) {
    console.error("Failed to preload connected apps:", e);
    await reportServerException(e, {
      op_name: "ConnectedAppsPage.preloadConnectedApps",
      route: "/account/connected-apps",
      uid: user.uid,
      context: { nonFatal: true },
    });
  }

  return <ConnectedAppsPageView preloaded={preloaded} />;
}

export default async function AuthServerConnectedAppsPage(): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(
    AuthServerConnectedAppsPageServerComponent,
    { next_href: "/account/connected-apps" },
  );
}

export const runtime: ServerRuntime = "nodejs";
