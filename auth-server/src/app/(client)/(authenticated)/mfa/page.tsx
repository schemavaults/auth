import "server-only";
import type { ReactElement } from "react";

import MfaPageView from "./mfa-page-view";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

async function AuthServerMfaDashboardPageServerComponent(
  { user }: IProtectedAuthenticatedServerComponentPageProps,
): Promise<ReactElement> {
  if (!user) {
    // allow typescript to see that user data is set
    throw new Error(
      "This should be unreachable code-- redirectWithError seems to not have worked!",
    );
  }

  return <MfaPageView />;
}

export default async function AuthServerMfaDashboardPage(): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(
    AuthServerMfaDashboardPageServerComponent,
  );
}

export const runtime: ServerRuntime = "nodejs";
