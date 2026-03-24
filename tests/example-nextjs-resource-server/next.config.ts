// next.config.ts
import type { NextConfig } from "next";

function isNextStandaloneDockerBuildFlagSet(): boolean {
  return (
    typeof process.env.NEXT_STANDALONE_DOCKER_BUILD === "string" &&
    process.env.NEXT_STANDALONE_DOCKER_BUILD.length > 0
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isNextStandaloneDockerBuildFlagSet() ? "standalone" : undefined,
};

export default nextConfig;
