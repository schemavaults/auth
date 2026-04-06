import "server-only";
import type { ReactElement } from "react";

import CreateOrganizationPageView from "./create-organization-page-view";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { connection } from "next/server";
import type { ServerRuntime } from "next/types";

async function CreateOrganizationPageServerComponent(
  _props: IProtectedAuthenticatedServerComponentPageProps
): Promise<ReactElement> {
  return <CreateOrganizationPageView />;
}

export default async function CreateOrganizationPage(): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(CreateOrganizationPageServerComponent);
}

export const runtime: ServerRuntime = "nodejs";
