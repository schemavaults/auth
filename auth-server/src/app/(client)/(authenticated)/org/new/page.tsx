import "server-only";
import type { ReactElement } from "react";

import CreateOrganizationPageView from "./create-organization-page-view";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";

async function CreateOrganizationPageServerComponent(
  _props: IProtectedAuthenticatedServerComponentPageProps
): Promise<ReactElement> {
  return <CreateOrganizationPageView />;
}

export default async function CreateOrganizationPage(): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard(CreateOrganizationPageServerComponent);
}
