// next.config.ts
import type { NextConfig } from "next";

const output = (
  typeof process.env.NEXT_STANDALONE_DOCKER_BUILD === 'string' && process.env.NEXT_STANDALONE_DOCKER_BUILD.length > 0
) ? "standalone"
  : undefined;

console.log(
  `[next.config.ts] Building SchemaVaults Auth Server with output mode: ${output ?? "<default>"}`,
);

const nextConfig: NextConfig = {
  // Generate for a standalone container server if NEXT_STANDALONE_DOCKER_BUILD
  output,
  reactStrictMode: true,
};

export default nextConfig;
