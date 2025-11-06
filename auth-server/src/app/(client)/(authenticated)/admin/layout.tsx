import "server-only";

import redirectWithError from "@/lib/redirect-with-error";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import type { PotentiallyValidTokenSource } from "@schemavaults/auth-common";
import { RouteGuardFactory } from "@schemavaults/auth-server-sdk";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";

export default async function AdminPathsRouteGuardServerComponent({
  children,
}: PropsWithChildren) {
  if (process.env.NODE_ENV === "development") {
    console.log("[AdminPathsRouteGuardServerComponent] Preparing admin page!");
  }

  const token_sources: PotentiallyValidTokenSource[] = [];

  const refresh_token_cookie = (await cookies()).get("refresh_token");
  if (typeof refresh_token_cookie?.value === "string") {
    token_sources.push({
      sourceHint: "Auth Server Refresh Token",
      type: "refresh",
      token: refresh_token_cookie.value,
    });
  }

  const route_guard_factory = RouteGuardFactory.getInstance();
  const route_guard = await route_guard_factory.createGuardFromTokenSources(
    "admin",
    token_sources,
    SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
  );
  if (!route_guard.isAccessAllowed) {
    redirectWithError(
      (url: string, type): never => {
        return redirect(url);
      },
      401,
      "unauthenticated",
    );
  }
  const user = route_guard.user;
  if (!user) {
    redirectWithError(
      (url: string, type): never => {
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
