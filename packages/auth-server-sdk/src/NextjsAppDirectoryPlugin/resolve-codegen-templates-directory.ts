import { dirname, join, normalize } from "path";
import { existsSync } from "fs";

export default function resolveCodegenTemplatesDirectory(): string {
  if (!__dirname) {
    throw new Error(
      "The __dirname variable is not set for this file in this environment!",
    );
  }

  // Templates are copied into the dist/codegen-templates directory during build
  // ... but sometimes this runs from src/NextjsAppDirectoryPlugin/resolve-codegen-templates-directory.ts
  // ... while other times it is running from the bundled version at dist/cli.cjs

  if (existsSync(join(__dirname, "codegen-templates"))) {
    return normalize(join(__dirname, "codegen-templates"));
  } else if (existsSync(join(dirname(__dirname), "codegen-templates"))) {
    return normalize(join(dirname(__dirname), "codegen-templates"));
  } else if (
    existsSync(join(dirname(__dirname), "dist", "codegen-templates"))
  ) {
    return normalize(join(dirname(__dirname), "dist", "codegen-templates"));
  }

  throw new Error("Failed to resolve 'codegen-templates' directory!");
}
