import "server-only";

import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import type { PotentiallyValidTokenSource, UserData } from "@schemavaults/auth-common";
import {
  type IRouteGuard,
  RouteGuardFactory,
} from "@schemavaults/auth-server-sdk";
import type { cookies as CookiesGetterType } from "next/headers";
import type { ReactElement } from "react";
import redirectWithError from "@/lib/redirect-with-error";
import { redirect } from "next/navigation";

export interface ProtectedAdminPageProps {
  user: UserData;
}

export interface IWithAdminRouteGuardUtilOpts {
  ProtectedAdminPageServerComponent: (
    props: ProtectedAdminPageProps,
  ) => Promise<ReactElement>;
  cookies: Awaited<ReturnType<typeof CookiesGetterType>>;
}

export async function withAdminRouteGuard({
  ProtectedAdminPageServerComponent,
  cookies,
}: IWithAdminRouteGuardUtilOpts): Promise<ReactElement> {
  const token_sources: PotentiallyValidTokenSource[] = [];

  const refresh_token_cookie = cookies.get("refresh_token");
  if (typeof refresh_token_cookie?.value === "string") {
    token_sources.push({
      sourceHint: "Auth Server Refresh Token",
      type: "refresh",
      token: refresh_token_cookie.value,
    });
  }

  const route_guard_factory = RouteGuardFactory.getInstance();
  const route_guard: IRouteGuard =
    await route_guard_factory.createGuardFromTokenSources(
      "admin",
      token_sources,
      SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    );

  if (!route_guard.user) {
    redirectWithError(redirect, 401, "unauthenticated");
  }
  const user: UserData = route_guard.user;

  if (!route_guard.isAccessAllowed || !user.admin) {
    redirectWithError(redirect, 403, "forbidden");
  }

  return (await ProtectedAdminPageServerComponent({
    user,
  })) satisfies ReactElement;
}
