import "server-only";

import { withAuthenticatedServerComponentRouteGuard } from "@schemavaults/auth-server-sdk";
import type { ReactElement } from "react";
import Link from "next/link";
import { Button } from "@schemavaults/ui";

async function ExampleAccountPageContent(): Promise<ReactElement> {
  return (
    <main className="flex flex-col justify-start items-center gap-4 p-4">
      <h1>@schemavaults/example-nextjs-resource-server</h1>
      <h2>Example Account Page</h2>
      <p>
        If you're seeing this it means that you were not redirected because you
        are logged in!
      </p>
      <Link href="/auth/logout">
        <Button>Logout</Button>
      </Link>
    </main>
  );
}

export default async function ExampleAccountPage(): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard(
    ExampleAccountPageContent,
    {},
  );
}
