"use client";

import { type ReactElement, useEffect, useState } from "react";
import { useAuth } from "@schemavaults/auth-react-provider";

export function HydrationMarker(): ReactElement {
  const [hydrated, setHydrated] = useState<boolean>(false);
  const auth = useAuth();

  // Mark basic hydration (component mounted = React hydration complete)
  useEffect(() => {
    if (!hydrated) {
      setHydrated(true)
    }
  }, [hydrated, setHydrated]);

  return (
    <div
      id="schemavaults-auth-server-hydration-marker"
      className="hidden"
      data-hydrated={hydrated}
      data-auth-ready={auth.ready ?? false}
      suppressHydrationWarning
    />
  )
}
