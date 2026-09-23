"use client";

import type { PropsWithChildren, ReactElement } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";

/**
 * Page chrome around the generated API reference pages: the deployment's
 * wordmark linking home, then the page produced by
 * `@schemavaults/openapi-docs-ui`.
 */
export function DocsShell({ children }: PropsWithChildren): ReactElement {
  return (
    <main
      className="flex w-full max-w-5xl grow flex-col gap-6 self-center p-4 sm:p-8"
      data-testid="api-docs-page"
    >
      <nav className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <Link href="/" className="inline-flex items-center" aria-label="Home">
          <Wordmark className="text-xl" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </nav>
      {children}
    </main>
  );
}

export default DocsShell;
