"use client";

import { ThemedPageContainer, cn } from "@schemavaults/ui";
import type { PropsWithChildren } from "react";

export function PageContainer({ children }: PropsWithChildren) {
  return <ThemedPageContainer additionalContentContainerClassName={cn(
    'no-scrollbar'
  )}>{children}</ThemedPageContainer>;
}

export default PageContainer;
