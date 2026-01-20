import "server-only";

import {
  withAuthenticatedServerComponentRouteGuard,
  type IProtectedAuthenticatedServerComponentPageProps,
} from "@/lib/withAuthenticatedRouteGuard";
import type { ReactElement } from "react";
import JwksKeysPageView from "./jwks-keys-page-view";

async function JwksKeysPageServerComponent({
  dbh: _dbh,
  user: _user,
}: IProtectedAuthenticatedServerComponentPageProps): Promise<ReactElement> {
  return <JwksKeysPageView />;
}

export default async function JwksKeysPage(): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard(
    JwksKeysPageServerComponent
  );
}
