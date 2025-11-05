"use client";

import { ThemedPageContainer } from "@schemavaults/ui";
import type { PropsWithChildren } from "react";

export function PageContainer({ children }: PropsWithChildren) {
  return <ThemedPageContainer>{children}</ThemedPageContainer>;
}
