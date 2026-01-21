import "server-only";

import {
  withAuthenticatedServerComponentRouteGuard,
  type IProtectedAuthenticatedServerComponentPageProps,
} from "@/lib/withAuthenticatedRouteGuard";
import type { ReactElement } from "react";
import JwksKeysPageView from "./jwks-access-keys-page-view";
import { AuthDatabase } from "@/lib/auth-db/auth-database-types";

async function JwksAccessKeysPageServerComponent({
  dbh: _dbh,
  user: _user,
}: IProtectedAuthenticatedServerComponentPageProps<AuthDatabase>): Promise<ReactElement> {
  return <JwksKeysPageView />;
}

export default async function JwksKeysPage(): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard(
    JwksAccessKeysPageServerComponent
  );
}
