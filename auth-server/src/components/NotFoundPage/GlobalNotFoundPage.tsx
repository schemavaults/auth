"use client";

import { useCallback, type ReactElement } from "react";
import { ErrorPage } from "@schemavaults/ui";
import { HYDRATION_MARKER_ID, useIsHydrated } from "@/components/HydrationMarker";
import type { AuthServerThemeColors } from "@/lib/config/default-auth-server-theme-colors";

export const GLOBAL_NOT_FOUND_STATUS_CODE = 404 as const;
export const GLOBAL_NOT_FOUND_MESSAGE = "Page not found" as const;
export const GLOBAL_NOT_FOUND_RESET_BUTTON_LABEL = "Return Home" as const;

export interface GlobalNotFoundPageProps {
  /**
   * @description Server-resolved SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME value,
   * rendered as the error page's <Wordmark /> text.
   */
  friendly_name: string;
  /**
   * @description Server-resolved [SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1,
   * SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2] values, rendered as the error
   * page's <Wordmark /> text gradient.
   */
  theme_colors: AuthServerThemeColors;
}

/**
 * @description Client half of the global 404 page (app/global-not-found.tsx).
 * Renders the @schemavaults/ui <ErrorPage /> with a "404: Page not found"
 * header and a reset button that navigates back to the home page.
 *
 * The global not-found route bypasses the root layout entirely, so the
 * friendly-name/theme-colors context providers mounted there are unavailable;
 * the white-label branding is instead resolved server-side by the route and
 * threaded in as props, then passed to the error page's `wordmarkProps`.
 */
export function GlobalNotFoundPage({
  friendly_name,
  theme_colors,
}: GlobalNotFoundPageProps): ReactElement {
  // A hard navigation (rather than a client-side router transition) so the
  // home page re-renders through the root layout, which this route skipped.
  const reset = useCallback((): void => {
    window.location.assign("/");
  }, []);
  const hydrated: boolean = useIsHydrated();

  return (
    <>
      {/*
        The (client) layout's <HydrationMarker /> is not mounted on this
        route (no root layout, no auth provider), so render an equivalent
        marker here for the E2E suite's cy.wait_for_page_hydration({
        waitForAuthReady: false }) helper. No data-auth-ready attribute is
        set since auth state is never loaded on the 404 page.
      */}
      <div
        id={HYDRATION_MARKER_ID}
        className="hidden"
        data-hydrated={hydrated}
        suppressHydrationWarning
      />
      <ErrorPage
        error={GLOBAL_NOT_FOUND_STATUS_CODE}
        message={GLOBAL_NOT_FOUND_MESSAGE}
        reset={reset}
        resetButtonLabel={GLOBAL_NOT_FOUND_RESET_BUTTON_LABEL}
        wordmarkProps={{
          wordmarkText: friendly_name,
          gradientColors: theme_colors,
        }}
      />
    </>
  );
}

export default GlobalNotFoundPage;
