import { join } from "path";
import { existsSync } from "fs";
import { cwd } from "process";

function resolveProjectRoot(): string {
  const current: string = cwd();
  if (
    existsSync(join(current, "package.json")) &&
    (existsSync(join(current, "next.config.js")) ||
      existsSync(join(current, "next.config.ts")) ||
      existsSync(join(current, "next.config.mjs")) ||
      existsSync(join(current, "next.config.cjs")))
  ) {
    return current;
  } else {
    throw new Error("Failed to resolve package root!");
  }
}

export default function resolveAppDirectory(): string {
  const projectRoot: string = resolveProjectRoot();
  if (existsSync(join(projectRoot, "src", "app"))) {
    return join(projectRoot, "src", "app");
  } else if (existsSync(join(projectRoot, "app"))) {
    return join(projectRoot, "app");
  } else {
    throw new Error("Failed to resolve Next.js app/ directory!");
  }
}
