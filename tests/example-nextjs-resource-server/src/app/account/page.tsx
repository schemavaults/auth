import "server-only";

import {
  getSchemavaultsApiServerId,
  withAuthenticatedServerComponentRouteGuard,
} from "@schemavaults/auth-server-sdk";
import type { ReactElement } from "react";
import ExampleAccountPageView from "./view";
import { connection } from "next/server";

async function ExampleAccountPageContent(): Promise<ReactElement> {
  return (
    <ExampleAccountPageView api_server_id={getSchemavaultsApiServerId()} />
  );
}

export default async function ExampleAccountPage(): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(
    ExampleAccountPageContent,
    {},
  );
}
