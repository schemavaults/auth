"use client";

import Image from "next/image";
import type { ReactElement } from "react";
import { useAuthServerFriendlyName } from "@/components/Wordmark";

export interface LogoProps {
  height: number;
  width: number;
}

export function Logo({ width, height }: LogoProps): ReactElement {
  const friendly_name: string = useAuthServerFriendlyName();
  return (
    <Image
      src="/icon.png"
      alt={`${friendly_name} Logo`}
      width={width}
      height={height}
    />
  );
}

export default Logo;
