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
      className="w-screen h-screen min-h-[100dvh] overflow-x-hidden overflow-y-scroll"
    >
      <body
        className={[
          inter.className,
          "w-screen overflow-x-hidden",
          "min-h-[100dvh] h-screen overflow-y-scroll",
        ].join(" ")}
      >
        {children}
      </body>
    </html>
  );
}

export const runtime: ServerRuntime = "edge";
