"use client";

import type { PropsWithChildren, ReactElement } from "react";
import { ClientAuthProvider } from "./auth-provider";
import {
  LazyFramerMotionProvider,
  Toaster,
  TooltipProvider,
} from "@schemavaults/ui";

export default function ClientOnlyPageLayout({
  children,
}: PropsWithChildren): ReactElement {
  return (
    <ClientAuthProvider>
      <LazyFramerMotionProvider>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </LazyFramerMotionProvider>
    </ClientAuthProvider>
  );
}
