import "server-only";

import {
  getSchemavaultsApiServerId,
  withAuthenticatedServerComponentRouteGuard,
} from "@schemavaults/auth-server-sdk";
import type { ReactElement } from "react";
import ExampleAccountPageView from "./view";

async function ExampleAccountPageContent(): Promise<ReactElement> {
  return (
    <ExampleAccountPageView api_server_id={getSchemavaultsApiServerId()} />
  );
}

export default async function ExampleAccountPage(): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard(
    ExampleAccountPageContent,
    {},
  );
}
