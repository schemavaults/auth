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
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}

export const runtime: ServerRuntime = "edge";
