import type { Metadata, ServerRuntime } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";

// The global not-found route bypasses the root layout entirely, so global
// styles and fonts must be imported here again.
import "@schemavaults/theme/globals.css";

import { inter } from "./fonts/Inter";
import { GlobalNotFoundPage } from "@/components/NotFoundPage";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import getAuthServerThemeColors from "@/lib/config/auth-server-theme-colors";
import type { AuthServerThemeColors } from "@/lib/config/default-auth-server-theme-colors";

export async function generateMetadata(): Promise<Metadata> {
  // Resolve the env-var driven friendly name at request time (never frozen
  // into a build-time static prerender of the /_not-found route).
  await connection();
  const friendly_name: string = getAuthServerFriendlyName();
  return {
    title: `Page Not Found - ${friendly_name}`,
    description: "The page you are looking for does not exist.",
  };
}

/**
 * @description Global 404 page for URLs that match no route at all (Next.js
 * `global-not-found` convention, enabled via `experimental.globalNotFound` in
 * next.config.ts). Unlike a segment `not-found.tsx`, this renders a full HTML
 * document without the root layout, so the deployment's white-label branding
 * (SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME and _THEME_COLOR_1/2) is resolved
 * here server-side and threaded into the client-rendered
 * <GlobalNotFoundPage /> as `wordmarkProps` for the @schemavaults/ui
 * <ErrorPage />.
 */
export default async function GlobalNotFound(): Promise<ReactElement> {
  // Defer the request-time env reads out of static prerendering (matching the
  // root layout) so white-label deployments configured at runtime are honored.
  await connection();
  const friendly_name: string = getAuthServerFriendlyName();
  const theme_colors: AuthServerThemeColors = getAuthServerThemeColors();

  return (
    <html
      lang="en"
      className={[
        "w-screen min-h-[100dvh]",
        "overflow-x-hidden overflow-y-scroll",
        "flex flex-col justify-start items-stretch",
        "no-scrollbar",
        "overscroll-none",
      ].join(" ")}
    >
      <body
        className={[
          inter.className,
          "w-screen overflow-x-hidden",
          "grow",
          "min-h-[100dvh] overflow-y-scroll",
          "flex flex-col justify-start items-stretch",
          "no-scrollbar",
        ].join(" ")}
      >
        <GlobalNotFoundPage
          friendly_name={friendly_name}
          theme_colors={theme_colors}
        />
      </body>
    </html>
  );
}

export const runtime: ServerRuntime = "nodejs";
