"use client";

import Image from "next/image";
import { ReactElement } from "react";

export interface LogoProps {
  height: number;
  width: number;
}

export function Logo({ width, height }: LogoProps): ReactElement {
  return (
    <Image
      src="/icon.png"
      alt="SchemaVaults Logo"
      width={width}
      height={height}
    />
  );
}

export default Logo;
