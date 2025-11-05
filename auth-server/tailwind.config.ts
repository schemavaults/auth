console.log("@schemavaults/auth-server - tailwind.config.ts");

import type { Config } from "tailwindcss";
// Import the config factory
import { SchemaVaultsTailwindConfigFactory } from "@schemavaults/theme";

let currentDirectory: string;
try {
  currentDirectory = __dirname;
  if (typeof currentDirectory !== "string") {
    throw new Error("current dir path not a string");
  }
} catch (e: unknown) {
  console.error("Failed to load current directory");
  process.exit(1);
}

// Import helper utilities for file/module resolution
import { join } from "path";
import { existsSync, lstatSync, type Stats } from "fs";

function node_modules(): string {
  let node_modules_path: string;
  if (currentDirectory.endsWith("/src") || currentDirectory.endsWith("/dist")) {
    node_modules_path = join(currentDirectory, "..", "node_modules");
  } else {
    node_modules_path = join(currentDirectory, "node_modules");
  }

  return node_modules_path;
}

function isdir(path: string): boolean {
  if (!existsSync(path)) return false;

  let lstatResult: Stats;
  try {
    lstatResult = lstatSync(path);
  } catch (e: unknown) {
    throw new Error(
      "Error running lstatSync for tailwind.config.ts isdir() function!",
    );
  }
  return lstatResult.isDirectory();
}

if (!isdir(node_modules())) {
  console.error("Failed to resolve node_modules/ directory for test!");
  throw new Error("Failed to resolve node_modules/ directory for test!");
}

let config: Config;
try {
  // Initialize the config factory
  const configFactory = new SchemaVaultsTailwindConfigFactory({
    node_modules,
    isdir,
    join,
    debug: true,
  });

  // Generate and export the config
  config = configFactory.createConfig({
    content: [
      "./src/**/*.{tsx,jsx,js,ts}",
      "./app/**/*.{tsx,jsx,js,ts}",
      "@schemavaults/ui",
      "@schemavaults/auth-ui",
    ],
  }) satisfies Config;
} catch (e) {
  console.error(
    "Failed to generate TailwindCSS config using @schemavaults/theme module!",
    e,
  );
  process.exit(1);
}

export default config;
