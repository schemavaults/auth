import type { NextConfig } from "next";

const output = !!process.env.NEXT_STANDALONE_DOCKER_BUILD
  ? "standalone"
  : undefined;

console.log(
  `Building SchemaVaults Next.js Auth Server App with output mode: ${output ?? "<default>"}`,
);

const nextConfig: NextConfig = {
  // Generate for a standalone container server if NEXT_STANDALONE_DOCKER_BUILD
  output,
  reactStrictMode: true,
};

export default nextConfig;
