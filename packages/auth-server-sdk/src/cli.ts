import { NextjsAppDirectoryPlugin } from "./NextjsAppDirectoryPlugin";

const PACKAGE_NAME = "@schemavaults/auth-server-sdk";

const HELP_TEXT = `Usage: ${PACKAGE_NAME} [command] [options]

Commands:
  codegen              Generate auth pages for your Next.js app (default)

Options:
  --templates-dir <path>   Custom codegen templates directory
  --debug                  Enable debug logging
  --help, -h               Show this help message
  --version, -v            Show package name
`;

function printHelp() {
  console.log(HELP_TEXT);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`${PACKAGE_NAME}@${__SDK_VERSION__ ?? "unknown"}`);
    return;
  }

  const command = args.find((arg) => !arg.startsWith("-")) ?? "codegen";

  if (command !== "codegen") {
    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
  }

  const templatesDirIndex = args.indexOf("--templates-dir");
  const templatesDir =
    templatesDirIndex !== -1 ? args[templatesDirIndex + 1] : undefined;

  if (templatesDirIndex !== -1 && !templatesDir) {
    console.error("Error: --templates-dir requires a path argument\n");
    printHelp();
    process.exit(1);
  }

  const debug = args.includes("--debug");

  await NextjsAppDirectoryPlugin.codegen({
    ...(templatesDir ? { codegenTemplatesDirectory: templatesDir } : {}),
    debug,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
