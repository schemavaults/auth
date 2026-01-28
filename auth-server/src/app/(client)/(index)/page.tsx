import "server-only";
import type { ReactElement } from "react";
import type { ServerRuntime } from "next/types";
import HomePageView from "./HomePageView";

export default function HomePage(): ReactElement {
  return <HomePageView />;
}

export const runtime: ServerRuntime = "edge";
