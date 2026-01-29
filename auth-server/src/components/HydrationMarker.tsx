"use client";

import { type ReactElement, useSyncExternalStore } from "react";
import { useAuth } from "@schemavaults/auth-react-provider";

const emptySubscribe = (): (() => void) => () => {};
const getClientSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

export function HydrationMarker(): ReactElement {
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  const auth = useAuth();

  return (
    <div
      id="schemavaults-auth-server-hydration-marker"
      className="hidden"
      data-hydrated={hydrated}
      data-auth-ready={auth.ready ?? false}
      suppressHydrationWarning
    />
  );
}
