"use client";

import { Button } from "@schemavaults/ui";
import Link from "next/link";
import type { ReactElement } from "react";

export default function IndexPage(): ReactElement {
  return (
    <main className="flex flex-col items-center justify-start gap-4 p-4">
      <h1 className="text-xl font-bold">
        @schemavaults/example-nextjs-resource-server
      </h1>
      <h2>Example Home Page</h2>
      <Link href="/auth/login">
        <Button>Login</Button>
      </Link>
      <Link href="/auth/register">
        <Button>Register</Button>
      </Link>
      {/* Standard-OIDC sign-in via the `openid-client` npm package (no
          SchemaVaults SDK): a route handler, so a plain anchor forces a
          full document navigation instead of a Next.js client-side
          transition. */}
      <a href="/openid-client/login" data-testid="openid-client-login-link">
        <Button variant="outline">Sign in with openid-client</Button>
      </a>
    </main>
  );
}
