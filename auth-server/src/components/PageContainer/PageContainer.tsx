"use client";

import { ThemedPageContainer, cn } from "@schemavaults/ui";
import type { PropsWithChildren } from "react";
import { useAuthServerThemeColors } from "@/components/ThemeColors";

export function PageContainer({ children }: PropsWithChildren) {
  const theme_colors = useAuthServerThemeColors();
  return <ThemedPageContainer gradientColors={theme_colors} additionalContentContainerClassName={cn(
    'no-scrollbar'
  )}>{children}</ThemedPageContainer>;
}

export default PageContainer;
