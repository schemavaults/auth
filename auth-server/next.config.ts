// next.config.ts
import type { NextConfig } from "next";
import { join, normalize } from "path";
import { existsSync, readFileSync } from "fs";

const output =
  typeof process.env.NEXT_STANDALONE_DOCKER_BUILD === "string" &&
  process.env.NEXT_STANDALONE_DOCKER_BUILD.length > 0
    ? "standalone"
    : undefined;

function resolveAuthServerRootDir(): string {
  let currentDirectory: string = __dirname;
  function containsAuthServerPackageJson(dir: string): boolean {
    if (!existsSync(join(dir, "package.json"))) {
      return false;
    }

    const file = readFileSync(join(dir, "package.json"), "utf8");
    const packageJson = JSON.parse(file);
    return packageJson.name === "@schemavaults/auth-server";
  }

  const MAX_TRAVERSE_UPWARDS_ATTEMPTS: number = 8;
  for (let i = 0; i < MAX_TRAVERSE_UPWARDS_ATTEMPTS; i++) {
    if (containsAuthServerPackageJson(currentDirectory)) {
      return normalize(currentDirectory);
    }
    currentDirectory = join(currentDirectory, "..");
  }
  console.error(
    "[next.config.ts] Could not find @schemavaults/auth-server package root",
  );
  process.exit(1);
}

const projectRoot: string = resolveAuthServerRootDir();
if (!existsSync(join(projectRoot, "package.json"))) {
  throw new Error("@schemavaults/auth-server package.json not found");
}
const monorepoRoot: string = normalize(join(projectRoot, ".."));
if (!existsSync(join(monorepoRoot, "package.json"))) {
  throw new Error("@schemavaults/auth monorepo root package.json not found");
}

console.group(`[next.config.ts] Configuring @schemavaults/auth-server...`);
console.log(`(output mode: ${output ?? "<default>"}`);
console.log("monorepo root: ", monorepoRoot);
console.log("project root: ", projectRoot);
console.groupEnd();

const nextConfig: NextConfig = {
  // Generate for a standalone container server if NEXT_STANDALONE_DOCKER_BUILD
  output,
  reactStrictMode: true,
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
