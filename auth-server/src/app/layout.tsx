import type { Metadata, ServerRuntime } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";

import "@schemavaults/theme/globals.css";

import { getAuthServerUrl } from "@schemavaults/app-definitions";
import { AuthUiOwnerOrganizationProvider } from "@schemavaults/auth-ui";
import { inter } from "./fonts/Inter";
import { AuthServerFriendlyNameProvider } from "@/components/Wordmark";
import { AuthServerThemeColorsProvider } from "@/components/ThemeColors";
import { AuthServerUrlProvider } from "@/components/AuthServerUrl";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import getAuthServerDescription from "@/lib/config/auth-server-description";
import getAuthServerOwnerOrganizationId from "@/lib/config/auth-server-owner-organization";
import getAuthServerThemeColors from "@/lib/config/auth-server-theme-colors";
import {
  GENERATED_OPENGRAPH_IMAGE_WIDTH,
  GENERATED_OPENGRAPH_IMAGE_HEIGHT,
} from "@/lib/branding/generated-og-image";
import { resolveBrandingMetadata } from "@/lib/branding/branding-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const title: string = getAuthServerFriendlyName();
  const description: string = getAuthServerDescription();

  // Branding images (favicon, app icon, opengraph image) are served by the
  // /branding/[asset] route: administrator-uploaded assets from the database
  // when present, bundled/generated white-label defaults otherwise. The URLs
  // carry a ?v= content-hash version so browser/CDN caches bust on rebrand.
  const branding = await resolveBrandingMetadata();

  return {
    title,
    description,
    ...(branding.metadataBase !== null
      ? { metadataBase: branding.metadataBase }
      : {}),
    icons: {
      icon: [{ url: branding.faviconUrl }, { url: branding.iconUrl }],
      apple: [{ url: branding.iconUrl }],
    },
    openGraph: {
      title,
      description,
      siteName: title,
      images: [
        branding.opengraphImageIsGenerated
          ? {
              url: branding.opengraphImageUrl,
              width: GENERATED_OPENGRAPH_IMAGE_WIDTH,
              height: GENERATED_OPENGRAPH_IMAGE_HEIGHT,
            }
          : { url: branding.opengraphImageUrl },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [branding.opengraphImageUrl],
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Defer request-time env reads (getAuthServerUrl() resolves the app
  // environment, which throws when SCHEMAVAULTS_APP_ENVIRONMENT is unset) out
  // of static prerendering, matching the example resource server's root layout.
  await connection();
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
          <AuthUiOwnerOrganizationProvider
            owner_organization_id={getAuthServerOwnerOrganizationId()}
          >
            <AuthServerThemeColorsProvider
              theme_colors={getAuthServerThemeColors()}
            >
              <AuthServerUrlProvider auth_server_url={getAuthServerUrl()}>
                {children}
              </AuthServerUrlProvider>
            </AuthServerThemeColorsProvider>
          </AuthUiOwnerOrganizationProvider>
        </AuthServerFriendlyNameProvider>
      </body>
    </html>
  );
}

export const runtime: ServerRuntime = "nodejs";
