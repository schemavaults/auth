"use client";

import {
  PageColumnContainer,
  ThemedPageBackground,
  cn,
} from "@schemavaults/ui";
import type { PropsWithChildren } from "react";

export function PageContainer({ children }: PropsWithChildren) {
  return (
    <ThemedPageBackground
      className={cn(
        "flex flex-col items-stretch justify-start",
        "min-h-full",
        "p-2 sm:p-4 lg:p-6",
      )}
    >
      <PageColumnContainer
        className={cn("rounded-lg", "gap-2 sm:gap-4 lg:gap-6", "no-scrollbar")}
      >
        {children}
      </PageColumnContainer>
    </ThemedPageBackground>
  );
}

export default PageContainer;
