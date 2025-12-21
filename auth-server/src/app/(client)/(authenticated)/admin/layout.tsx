import "server-only";

import redirectWithError from "@/lib/redirect-with-error";
import {
  getAppEnvironment,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { PotentiallyValidTokenSource } from "@schemavaults/auth-common";
import RouteGuardFactory from "@/lib/RouteGuardFactory";
import { cookies } from "next/headers";
import { redirect, type RedirectType } from "next/navigation";
import type { ReactNode } from "react";
import { ServerlessDatabase } from "@/lib/auth-db";

export default async function AdminPathsRouteGuardServerComponent({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (environment === "development") {
    console.log("[AdminPathsRouteGuardServerComponent] Preparing admin page!");
  }

  await using dbh = ServerlessDatabase.createDBH();

  const token_sources: PotentiallyValidTokenSource[] = [];

  const refresh_token_cookie = (await cookies()).get("refresh_token");
  if (typeof refresh_token_cookie?.value === "string") {
    token_sources.push({
      sourceHint: "Auth Server Refresh Token",
      type: "refresh",
      token: refresh_token_cookie.value,
    });
  }

  const route_guard_factory = new RouteGuardFactory(dbh.db);
  const route_guard = await route_guard_factory.createGuardFromTokenSources(
    "admin",
    token_sources,
    SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
  );
  if (!route_guard.isAccessAllowed) {
    redirectWithError(
      (url: string, type: RedirectType | undefined): never => {
        void type;
        return redirect(url);
      },
      401,
      "unauthenticated",
    );
  }
  const user = route_guard.user;
  if (!user) {
    redirectWithError(
      (url: string, type: RedirectType | undefined): never => {
        void type;
        return redirect(url);
      },
      401,
      "load_user_data_failure",
    );
  }
  if (!user) {
    // allow typescript to see that user data is set
    throw new Error(
      "This should be unreachable code-- redirectWithError seems to not have worked!",
    );
  } else if (!user.admin) {
    throw new Error(
      "This should be unreachable code-- redirectWithError seems to not have redirected user despite not being an admin!",
    );
  }

  return children;
}
