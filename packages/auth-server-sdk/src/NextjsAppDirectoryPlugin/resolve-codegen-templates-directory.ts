import { dirname, join } from "path";

export default function resolveCodegenTemplatesDirectory(): string {
  if (!__dirname) {
    throw new Error(
      "The __dirname variable is not set for this file in this environment!",
    );
  }

  // Templates are copied into the dist/codegen-templates directory during build
  return join(dirname(__dirname), "codegen-templates");
}
