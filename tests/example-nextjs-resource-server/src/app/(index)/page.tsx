"use client";

import { Button } from "@schemavaults/ui";
import Link from "next/link";
import type { ReactElement } from "react";

export default function IndexPage(): ReactElement {
  return (
    <main className="flex flex-col items-center justify-start gap-4">
      <h1>@schemavaults/example-nextjs-resource-server</h1>
      <Link href="/auth/login">
        <Button>Login</Button>
      </Link>
      <Link href="/auth/register">
        <Button>Register</Button>
      </Link>
    </main>
  );
}
