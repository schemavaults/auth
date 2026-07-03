import type { Metadata, ServerRuntime } from "next";
import type { ReactNode } from "react";

import "@schemavaults/theme/globals.css";

import { inter } from "./fonts/Inter";
import { AuthServerFriendlyNameProvider } from "@/components/Wordmark";
import { AuthServerThemeColorsProvider } from "@/components/ThemeColors";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import getAuthServerDescription from "@/lib/config/auth-server-description";
import getAuthServerThemeColors from "@/lib/config/auth-server-theme-colors";

export function generateMetadata(): Metadata {
  return {
    title: getAuthServerFriendlyName(),
    description: getAuthServerDescription(),
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={
        [
          "w-screen min-h-[100dvh]",
          "overflow-x-hidden overflow-y-scroll",
          "flex flex-col justify-start items-stretch",
          "no-scrollbar",
          "overscroll-none"
        ].join(" ")
      }
    >
      <body
        className={[
          inter.className,
          "w-screen overflow-x-hidden",
          "grow",
          "min-h-[100dvh] overflow-y-scroll",
          "flex flex-col justify-start items-stretch",
          "no-scrollbar"
        ].join(" ")}
      >
        <AuthServerFriendlyNameProvider
          friendly_name={getAuthServerFriendlyName()}
        >
          <AuthServerThemeColorsProvider
            theme_colors={getAuthServerThemeColors()}
          >
            {children}
          </AuthServerThemeColorsProvider>
        </AuthServerFriendlyNameProvider>
      </body>
    </html>
  );
}

export const runtime: ServerRuntime = "nodejs";
