import { NextjsAppDirectoryPlugin } from "./NextjsAppDirectoryPlugin";

const PACKAGE_NAME = "@schemavaults/auth-server-sdk";

const HELP_TEXT = `Usage: ${PACKAGE_NAME} [command] [options]

Commands:
  codegen              Generate auth pages for your Next.js app (default)

Options:
  --output-dir <path>      Custom output directory for the generated auth files
                           (defaults to <app>/auth, e.g. src/app/auth).
                           Useful for nesting under a route group, e.g.
                           src/app/(client)/auth.
  --templates-dir <path>   Custom codegen templates directory
  --debug                  Enable debug logging
  --help, -h               Show this help message
  --version, -v            Show package name
`;

function printHelp() {
  console.log(HELP_TEXT);
}

function readStringFlag(
  args: string[],
  flag: string,
): { present: boolean; value: string | undefined } {
  const index = args.indexOf(flag);
  if (index === -1) {
    return { present: false, value: undefined };
  }
  return { present: true, value: args[index + 1] };
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

  const templatesFlag = readStringFlag(args, "--templates-dir");
  if (templatesFlag.present && !templatesFlag.value) {
    console.error("Error: --templates-dir requires a path argument\n");
    printHelp();
    process.exit(1);
  }

  const outputFlag = readStringFlag(args, "--output-dir");
  if (outputFlag.present && !outputFlag.value) {
    console.error("Error: --output-dir requires a path argument\n");
    printHelp();
    process.exit(1);
  }

  const debug = args.includes("--debug");

  await NextjsAppDirectoryPlugin.codegen({
    ...(templatesFlag.value
      ? { codegenTemplatesDirectory: templatesFlag.value }
      : {}),
    ...(outputFlag.value ? { outputDirectory: outputFlag.value } : {}),
    debug,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
