"use client";

import { ThemedPageContainer, cn } from "@schemavaults/ui";
import type { PropsWithChildren } from "react";
import { useAuthServerThemeColors } from "@/components/ThemeColors";

export function PageContainer({ children }: PropsWithChildren) {
  // Inverted ([color 2, color 1]) to match <ThemedPageBackground />
  const [color_1, color_2] = useAuthServerThemeColors();
  return <ThemedPageContainer gradientColors={[color_2, color_1]} additionalContentContainerClassName={cn(
    'no-scrollbar'
  )}>{children}</ThemedPageContainer>;
}

export default PageContainer;
