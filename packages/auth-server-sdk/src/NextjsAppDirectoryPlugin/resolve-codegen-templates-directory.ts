import { dirname, join } from "path";

export default function resolveCodegenTemplatesDirectory(): string {
  // Templates are copied into the dist/codegen-templates directory during build
  return join(dirname(__dirname), "codegen-templates");
}
