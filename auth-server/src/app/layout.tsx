import type { Metadata, ServerRuntime } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import "@schemavaults/theme/globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SchemaVaults Auth",
  description: "Authentication and authorization for SchemaVaults",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className="w-screen min-h-[100dvh] overflow-x-hidden overflow-y-scroll flex flex-col justify-start items-stretch"
    >
      <body
        className={[
          inter.className,
          "w-screen overflow-x-hidden",
          "grow",
          "min-h-[100dvh] overflow-y-scroll",
          "flex flex-col justify-start items-stretch",
        ].join(" ")}
      >
        {children}
      </body>
    </html>
  );
}

export const runtime: ServerRuntime = "edge";
