// next.config.ts
import type { NextConfig } from "next";
import { join, normalize } from "path";
import { existsSync } from "fs";

const output =
  typeof process.env.NEXT_STANDALONE_DOCKER_BUILD === "string" &&
  process.env.NEXT_STANDALONE_DOCKER_BUILD.length > 0
    ? "standalone"
    : undefined;

console.log(
  `[next.config.ts] Configuring @schemavaults/auth-server... (output mode: ${output ?? "<default>"})`,
);

const projectRoot = __dirname;
if (!existsSync(join(projectRoot, "package.json"))) {
  throw new Error("package.json not found");
}
const monorepoRoot: string = normalize(join(projectRoot, ".."));

const nextConfig: NextConfig = {
  // Generate for a standalone container server if NEXT_STANDALONE_DOCKER_BUILD
  output,
  reactStrictMode: true,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
