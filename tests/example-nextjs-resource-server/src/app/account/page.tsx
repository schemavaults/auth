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

function toSearchString(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(name, item);
    }
  }
  const search: string = params.toString();
  return search.length > 0 ? `?${search}` : "";
}

export default async function ExampleAccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(
    ExampleAccountPageContent,
    {},
    // A signed-out visitor is sent back here (query included) after
    // signing in.
    { next_href: "/account" + toSearchString(await searchParams) },
  );
}
