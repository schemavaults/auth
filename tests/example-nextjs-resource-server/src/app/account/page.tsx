import "server-only";

import { withAuthenticatedServerComponentRouteGuard } from "@schemavaults/auth-server-sdk";
import type { ReactElement } from "react";

async function ExampleAccountPageContent(): Promise<ReactElement> {
  return (
    <main>
      <h1>Example Account Page</h1>
      <p>
        If you're seeing this it means that you were not redirected because you
        are logged in!
      </p>
    </main>
  );
}

export default async function ExampleAccountPage(): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard(
    ExampleAccountPageContent,
    {},
  );
}
