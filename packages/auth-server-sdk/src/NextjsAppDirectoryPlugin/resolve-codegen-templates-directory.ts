export default function resolveCodegenTemplatesDirectory(): string {
  const filepath: string = require.resolve(
    "@schemavaults/auth-resource-server-codegen-templates",
  );
  console.log(filepath);
  return filepath;
}
