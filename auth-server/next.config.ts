// next.config.ts
import type { NextConfig } from "next";
import { join, normalize } from "path";
import { existsSync, readFileSync } from "fs";

function isNextStandaloneDockerBuildFlagSet(): boolean {
  return (
    typeof process.env.NEXT_STANDALONE_DOCKER_BUILD === "string" &&
    process.env.NEXT_STANDALONE_DOCKER_BUILD.length > 0
  );
}

function isIncludeProductionSourceMapsFlagSet(): boolean {
  return (
    typeof process.env.NEXT_INCLUDE_PRODUCTION_SOURCE_MAPS === "string" &&
    process.env.NEXT_INCLUDE_PRODUCTION_SOURCE_MAPS.length > 0 &&
    process.env.NEXT_INCLUDE_PRODUCTION_SOURCE_MAPS !== "false" &&
    process.env.NEXT_INCLUDE_PRODUCTION_SOURCE_MAPS !== "no"
  );
}
const productionBrowserSourceMaps: boolean =
  isIncludeProductionSourceMapsFlagSet();

const output: "standalone" | undefined = isNextStandaloneDockerBuildFlagSet()
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
console.log(`output mode: ${output ?? "<default>"}`);
console.log("monorepo root: ", monorepoRoot);
console.log("project root: ", projectRoot);
console.log("production source maps: ", productionBrowserSourceMaps);
console.groupEnd();

const nextConfig: NextConfig = {
  // Generate for a standalone container server if NEXT_STANDALONE_DOCKER_BUILD
  output,
  reactStrictMode: true,
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
  // The /branding/[asset] route and every page's generateMetadata (root
  // layout) read the bundled default branding assets from
  // public/branding-defaults/ at serve time. Force them into serverless
  // route traces ("/*" is matched with picomatch contains:true, i.e. all
  // routes); the standalone Docker image copies public/ explicitly.
  outputFileTracingIncludes: {
    "/*": ["./public/branding-defaults/**/*"],
  },
  productionBrowserSourceMaps,
  async redirects() {
    return [
      // Organization pages moved from /org/* to /orgs/* (alongside the new
      // /orgs listing page). Keep old bookmarks, emails, and external links
      // working with a permanent redirect; the query string is preserved.
      {
        source: "/org/:path*",
        destination: "/orgs/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      // Browsers and crawlers that ignore the <link rel="icon"> tag request
      // /favicon.ico directly; serve the white-label branding favicon there.
      {
        source: "/favicon.ico",
        destination: "/branding/favicon",
      },
      // OIDC Discovery 1.0 §4: relying parties resolve provider metadata
      // at the spec-fixed well-known path. A rewrite (rather than an app
      // route in a dotted `.well-known` directory) keeps the route
      // handler in the ordinary /api/oidc tree.
      {
        source: "/.well-known/openid-configuration",
        destination: "/api/oidc/openid-configuration",
      },
    ];
  },
};

export default nextConfig;
