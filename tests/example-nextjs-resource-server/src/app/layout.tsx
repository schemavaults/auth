import type { Metadata, ServerRuntime } from "next";
import type { ReactNode } from "react";

import "@schemavaults/theme/globals.css";
import {
  getAppEnvironment,
  getSchemavaultsApiServerId,
  getSchemavaultsClientApplicationId,
} from "@schemavaults/auth-server-sdk";
import AuthProvider from "./auth/auth-provider";

export const metadata: Metadata = {
  title: "SchemaVaults Auth Example Next.js Resource Server",
  description:
    "A demo app that provides login functionality using @schemavaults/auth-server",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const environment = getAppEnvironment();

  return (
    <html
      lang="en"
      className={[
        "w-screen min-h-[100dvh]",
        "overflow-x-hidden overflow-y-scroll",
        "flex flex-col justify-start items-stretch",
        "no-scrollbar",
      ].join(" ")}
    >
      <body
        className={[
          "w-screen overflow-x-hidden",
          "grow",
          "min-h-[100dvh] overflow-y-scroll",
          "flex flex-col justify-start items-stretch",
          "no-scrollbar",
        ].join(" ")}
      >
        <AuthProvider
          environment={environment}
          app_id={getSchemavaultsClientApplicationId()}
          default_audiences={[getSchemavaultsApiServerId()]}
          authed_on_unauthed_redirect_uri="/account"
          unauthed_on_authed_redirect_uri="/auth/login"
          successful_logout_redirect_uri="/"
          successful_authentication_redirect_uri="/account"
          authorize_uri="/auth/authorize"
        >
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

export const runtime: ServerRuntime = "edge";
