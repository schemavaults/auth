import { dirname, join, normalize } from "path";
import { existsSync } from "fs";

export default function resolveCodegenTemplatesDirectory(debug: boolean = false): string {
  if (!__dirname) {
    throw new Error(
      "The __dirname variable is not set for this file in this environment!",
    );
  }

  if (debug) {
    console.log(`[debug] resolveCodegenTemplatesDirectory: __dirname = '${__dirname}'`);
  }

  // Templates are copied into the dist/codegen-templates directory during build
  // ... but sometimes this runs from src/NextjsAppDirectoryPlugin/resolve-codegen-templates-directory.ts
  // ... while other times it is running from the bundled version at dist/cli.cjs

  const candidates = [
    join(__dirname, "codegen-templates"),
    join(dirname(__dirname), "codegen-templates"),
    join(dirname(__dirname), "dist", "codegen-templates"),
  ];

  for (const candidate of candidates) {
    const exists = existsSync(candidate);
    if (debug) {
      console.log(`[debug] resolveCodegenTemplatesDirectory: '${candidate}' exists = ${exists}`);
    }
    if (exists) {
      return normalize(candidate);
    }
  }

  throw new Error("Failed to resolve 'codegen-templates' directory!");
}
