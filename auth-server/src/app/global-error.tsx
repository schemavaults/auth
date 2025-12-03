"use client";

import { ErrorPage } from "@schemavaults/ui";
import type { ReactElement } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  void reset;
  return (
    <html>
      <body>
        <ErrorPage
          message="Something went wrong!"
          error={error}
        />
      </body>
    </html>
  )
}
