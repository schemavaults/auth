import "server-only";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@schemavaults/theme/globals.css";
import {
  getAppEnvironment,
  getSchemavaultsApiServerId,
  getSchemavaultsClientApplicationId,
} from "@schemavaults/auth-server-sdk";
import ClientLayout from "./client-layout";

export const metadata: Metadata = {
  title: "SchemaVaults Auth Example Next.js Resource Server",
  description:
    "A demo app that provides login functionality using @schemavaults/auth-server",
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
        <ClientLayout
          environment={getAppEnvironment()}
          api_server_id={getSchemavaultsApiServerId()}
          app_id={getSchemavaultsClientApplicationId()}
        >
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
