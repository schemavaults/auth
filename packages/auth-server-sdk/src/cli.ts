import { NextjsAppDirectoryPlugin } from "./NextjsAppDirectoryPlugin";
import { findCommand, readStringFlag } from "./cli-args";
import {
  SYNC_SCOPES_HELP_TEXT,
  runSyncScopesCommand,
} from "./api-scopes/sync-scopes-command";

const PACKAGE_NAME = "@schemavaults/auth-server-sdk";

const HELP_TEXT = `Usage: ${PACKAGE_NAME} [command] [options]

Commands:
  codegen              Generate auth pages for your Next.js app (default)
${SYNC_SCOPES_HELP_TEXT}
codegen options:
  --client-output-dir <path>  Custom output directory for the generated client
                              auth files (defaults to <app>/auth, e.g.
                              src/app/auth). Useful for nesting under a route
                              group, e.g. src/app/(client)/auth.
  --templates-dir <path>      Custom codegen templates directory
  --debug                     Enable debug logging

Options:
  --help, -h                  Show this help message
  --version, -v               Show package name
`;

/** Flags followed by a value, skipped when looking for the command. */
const FLAGS_WITH_VALUES = [
  "--client-output-dir",
  "--templates-dir",
  "--manifest",
  "--env-file",
] as const;

function printHelp() {
  console.log(HELP_TEXT);
}

async function codegen(args: string[]): Promise<void> {
  const templatesFlag = readStringFlag(args, "--templates-dir");
  if (templatesFlag.present && !templatesFlag.value) {
    console.error("Error: --templates-dir requires a path argument\n");
    printHelp();
    process.exit(1);
  }

  const clientOutputFlag = readStringFlag(args, "--client-output-dir");
  if (clientOutputFlag.present && !clientOutputFlag.value) {
    console.error("Error: --client-output-dir requires a path argument\n");
    printHelp();
    process.exit(1);
  }

  const debug = args.includes("--debug");

  await NextjsAppDirectoryPlugin.codegen({
    ...(templatesFlag.value
      ? { codegenTemplatesDirectory: templatesFlag.value }
      : {}),
    ...(clientOutputFlag.value
      ? { clientOutputDirectory: clientOutputFlag.value }
      : {}),
    debug,
  });
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

  const command = findCommand(args, FLAGS_WITH_VALUES) ?? "codegen";

  switch (command) {
    case "codegen":
      await codegen(args);
      return;
    case "sync-scopes":
      process.exitCode = await runSyncScopesCommand(args, {
        stdout: (line) => console.log(line),
        stderr: (line) => console.error(line),
      });
      return;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
