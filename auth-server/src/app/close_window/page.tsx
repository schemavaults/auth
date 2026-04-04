"use client";

import { Separator, Wordmark } from "@schemavaults/ui";
import type { ServerRuntime } from "next";
import { useEffect, type ReactElement } from "react";

function CloseWindowNowPage(): ReactElement {
  useEffect(() => {
    setTimeout(() => {
      try {
        window.close();
      } catch (e: unknown) {
        console.warn("Error automatically closing window: ", e);
      }
    }, 5000);
  }, []);

  return (
    <div className="flex flex-col w-full min-h-screen items-center justify-center">
      <main className="flex flex-col items-center justify-center p-0 sm:p-2 md:p-4 gap-2 md:gap-4 lg:gap-6">
        <Wordmark />
        <Separator />
        <p className="font-bold">CLI operation successful.</p>
        <p>
          You may now close this window. (Or it will close automatically in a
          few seconds...)
        </p>
      </main>
    </div>
  );
}

export default CloseWindowNowPage;

//  Force static rendering and cache the data of a layout or page by causing an error if any components use Dynamic APIs or uncached data
export const dynamic = "force-static";
export const dynamicParams: boolean = false;

export const revalidate: boolean = false;

export const runtime: ServerRuntime = "nodejs";
