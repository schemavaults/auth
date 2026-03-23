import { join } from "path";
import { existsSync } from "fs";
import { cwd } from "process";

function resolveProjectRoot(debug: boolean): string {
  const current: string = cwd();
  if (debug) {
    console.log(`[debug] resolveProjectRoot: cwd = '${current}'`);
    const nextConfigVariants = ["next.config.js", "next.config.ts", "next.config.mjs", "next.config.cjs"];
    console.log(`[debug] resolveProjectRoot: package.json exists = ${existsSync(join(current, "package.json"))}`);
    for (const variant of nextConfigVariants) {
      console.log(`[debug] resolveProjectRoot: ${variant} exists = ${existsSync(join(current, variant))}`);
    }
  }
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

export default function resolveAppDirectory(debug: boolean = false): string {
  const projectRoot: string = resolveProjectRoot(debug);
  if (debug) {
    console.log(`[debug] resolveAppDirectory: projectRoot = '${projectRoot}'`);
    console.log(`[debug] resolveAppDirectory: src/app exists = ${existsSync(join(projectRoot, "src", "app"))}`);
    console.log(`[debug] resolveAppDirectory: app exists = ${existsSync(join(projectRoot, "app"))}`);
  }
  if (existsSync(join(projectRoot, "src", "app"))) {
    return join(projectRoot, "src", "app");
  } else if (existsSync(join(projectRoot, "app"))) {
    return join(projectRoot, "app");
  } else {
    throw new Error("Failed to resolve Next.js app/ directory!");
  }
}
