"use client";

import { type ReactElement, useSyncExternalStore } from "react";
import { useAuth } from "@schemavaults/auth-react-provider";

/**
 * @description DOM id of the hidden hydration marker element that the E2E
 * suite's `cy.wait_for_page_hydration()` helper command polls for.
 */
export const HYDRATION_MARKER_ID = "schemavaults-auth-server-hydration-marker";

const emptySubscribe = (): (() => void) => () => {};
const getClientSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

/**
 * @description `false` during SSR and the initial hydration render, `true`
 * once this client component has hydrated in the browser.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
}

export function HydrationMarker(): ReactElement {
  const hydrated: boolean = useIsHydrated();
  const auth = useAuth();

  return (
    <div
      id={HYDRATION_MARKER_ID}
      className="hidden"
      data-hydrated={hydrated}
      data-auth-ready={auth.ready ?? false}
      suppressHydrationWarning
    />
  );
}
