// e2e-auth-tests-cli.ts

import { Command } from "commander";
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, normalize } from "node:path";

if (!existsSync(join(process.cwd(), "docker-compose.yml"))) {
  throw new Error(
    "Expected docker-compose.yml to be in the current directory!",
  );
}

if (!existsSync(join(process.cwd(), "cypress.config.ts"))) {
  throw new Error("Expected cypress.config.ts to be in the current directory!");
}

if (!existsSync(join(process.cwd(), "package.json"))) {
  throw new Error(
    "Expected a package.json file to be in the current directory!",
  );
}

const e2e_test_suites_directory: string = join(process.cwd(), "cypress", "e2e");

const monorepo_root_directory: string = normalize(
  join(process.cwd(), "..", ".."),
);

if (!existsSync(join(monorepo_root_directory, "package.json"))) {
  throw new Error(
    "Expected a package.json file to be in the monorepo root directory!",
  );
}

function listTestSuites(): readonly string[] {
  const filenames = readdirSync(e2e_test_suites_directory);
  const test_suites: string[] = [];
  for (const filename of filenames) {
    if (filename === ".DS_Store") {
      continue;
    }
    test_suites.push(filename);
  }
  if (test_suites.length === 0) {
    console.warn(
      `No test suites were found in expected directory '${e2e_test_suites_directory}'!`,
    );
    process.exit(1);
  }
  return test_suites;
}

function launchDockerComposeTests(
  test_suite_name: string,
  docker_compose_profile: string,
  ...args: readonly string[]
): void {
  const dockerComposeCommand: string[] = [
    "docker",
    "compose",
    "-f",
    "tests/e2e-auth-tests/docker-compose.yml",
    "--profile",
    docker_compose_profile,
    "up",
    ...args, // additional args for 'docker compose up'
  ];
  console.log(
    `[e2e-auth-tests-cli] Running E2E tests with Docker Compose command: '${dockerComposeCommand.join(" ")}'`,
  );
  spawnSync(dockerComposeCommand.join(" "), {
    cwd: monorepo_root_directory,
    env: {
      TEST_SUITE_NAME: test_suite_name,
    },
  });
}

const e2eAuthTestsCli = new Command("e2e-auth-tests-cli");

e2eAuthTestsCli
  .command("e2e")
  .description("Run an E2E test suite")
  .argument("<test_suite>", "Name of the test suite to run")
  .option(
    "--verbose",
    "Whether we should show stdout from the running application server. By default only the test runner's stdout is shown.",
  )
  .action(async (test_suite_name: string, options): Promise<void> => {
    const test_suites: readonly string[] = listTestSuites();
    if (!test_suites.includes(test_suite_name)) {
      console.error(`No test suite found with name '${test_suite_name}'!`);
      process.exit(404);
    }

    const defaultDockerComposeProfile = "e2e" as const;
    const dockerComposeProfile: string = defaultDockerComposeProfile;

    // args for the `docker compose up` command that launches the e2e test
    const args: string[] = [
      "--abort-on-container-exit",
      "--exit-code-from",
      "schemavaults-e2e-auth-tests",
      "--build",
      "--force-recreate",
    ];

    // verbose flag
    const verbose: boolean =
      typeof options.verbose === "boolean" && options.verbose ? true : false;
    if (verbose) {
      args.push("--attach", "schemavaults-e2e-auth-tests");
    }

    launchDockerComposeTests(
      test_suite_name,
      dockerComposeProfile,
      ...args,
    ) satisfies void;
    return;
  });

e2eAuthTestsCli
  .command("suites")
  .description("List E2E test suite names")
  .action((): void => {
    const test_suites: readonly string[] = listTestSuites();
    console.log(
      `Found ${test_suites.length} E2E test suite${test_suites.length === 1 ? "" : "s"} with the following names:`,
    );
    for (const suite of test_suites) {
      console.log(`\t- ${suite}`);
    }
  });

async function main(): Promise<void> {
  await e2eAuthTestsCli.parseAsync();
}

main();
