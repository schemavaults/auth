// e2e-auth-tests-cli.ts

import { generateJwtSigningKeyPair, PEMFormat } from "@schemavaults/jwt";
import { Command } from "commander";
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { parseShardSelector, planShards, type Shard } from "./e2e-shards";
import { E2E_SPEC_DURATIONS_SECONDS } from "./e2e-spec-durations";

const dockerComposeFilePath = join(process.cwd(), "docker-compose.yml");
if (!existsSync(dockerComposeFilePath)) {
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

/** The suite's spec files (names relative to its folder), sorted. */
function listSuiteSpecs(test_suite_name: string): string[] {
  return readdirSync(join(e2e_test_suites_directory, test_suite_name))
    .filter((filename) => filename.endsWith(".cy.ts"))
    .sort((a, b) => a.localeCompare(b));
}

function planSuiteShards(test_suite_name: string, total: number): Shard[] {
  return planShards(
    listSuiteSpecs(test_suite_name),
    E2E_SPEC_DURATIONS_SECONDS[test_suite_name] ?? {},
    total,
  );
}

/**
 * Suites that run against the example Next.js resource server as well as
 * the auth server: any suite named after it, plus the dynamic client
 * registration suite (which completes a plain OAuth flow with a
 * dynamically registered client and calls the resource server's API with
 * the resulting `resource`-audience token). These use the
 * `e2e_with_resource_server` compose profile and get JWKS access keys.
 */
export function suiteNeedsExampleResourceServer(test_suite_name: string): boolean {
  return (
    test_suite_name.includes("resource_server") ||
    test_suite_name === "dynamic_client_registration"
  );
}

async function launchDockerComposeTests(
  test_suite_name: string,
  docker_compose_profile: string,
  /** Spec files of the suite to run; every spec when omitted. */
  specs: readonly string[] | undefined,
  ...args: readonly string[]
): Promise<void> {
  const dockerComposeCommand: string[] = [
    "docker",
    "compose",
    "-f",
    dockerComposeFilePath,
    "--profile",
    docker_compose_profile,
    "up",
    ...args, // additional args for 'docker compose up'
  ];
  console.log(
    `[e2e-auth-tests-cli] Running E2E test suite '${test_suite_name}' with Docker Compose command '${dockerComposeCommand.join(" ")}' from directory '${monorepo_root_directory}'`,
  );

  const environmentVariables: Record<string, string> = {
    ...process.env,
    TEST_SUITE_NAME: test_suite_name,
  };

  if (specs) {
    // docker-compose.yml hands this to `cypress run --spec` (comma-separated
    // paths relative to the test runner's working directory).
    environmentVariables["E2E_SPEC_PATTERN"] = specs
      .map((spec) => `./cypress/e2e/${test_suite_name}/${spec}`)
      .join(",");
  }

  if (suiteNeedsExampleResourceServer(test_suite_name)) {
    // we need to set up jwks access keys for the example resource server
    const [privateKey, publicKey] = await generateJwtSigningKeyPair();
    environmentVariables[
      "EXAMPLE_NEXTJS_RESOURCE_SERVER_JWKS_ACCESS_PUBLIC_KEY"
    ] = publicKey;
    const base64UrlPrivateKey: string = PEMFormat.parsePem(
      privateKey,
      "PRIVATE",
    ).toBase64Url();
    environmentVariables[
      "EXAMPLE_NEXTJS_RESOURCE_SERVER_JWKS_ACCESS_PRIVATE_KEY"
    ] = base64UrlPrivateKey;
  }

  if (test_suite_name === "white_label") {
    // Run the auth server (and the Cypress runner's expectations) as a
    // white-label deployment: non-default app id + custom branding env.
    // docker-compose.yml interpolates these into both containers.
    environmentVariables["SCHEMAVAULTS_AUTH_SERVER_APP_ID"] = "acme-sso-e2e";
    environmentVariables["SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME"] =
      "Acme SSO";
    environmentVariables["SCHEMAVAULTS_AUTH_SERVER_DESCRIPTION"] =
      "Single sign-on for Acme Corporation (E2E white-label test)";
    environmentVariables["SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1"] = "#123456";
    environmentVariables["SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2"] = "#654321";
  }

  const result = spawnSync(
    dockerComposeCommand[0],
    dockerComposeCommand.slice(1),
    {
      cwd: monorepo_root_directory,
      env: environmentVariables,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  if (result.error) {
    console.error("Tests failed with error: ", result.error);
    process.exit(1);
  }
  if (typeof result.status !== "number" || result.status !== 0) {
    console.error("Tests failed with result status: ", result.status);
    process.exit(typeof result.status === "number" ? result.status : 1);
  }
  console.log(
    `Test suite '${test_suite_name}' appears to have run successfully!`,
  );
  process.exit(0);
}

const e2eAuthTestsCli = new Command("e2e-auth-tests-cli");

e2eAuthTestsCli
  .command("e2e")
  .description("Run an E2E test suite")
  .argument("<test_suite>", "Name of the test suite to run")
  .option(
    "--verbose",
    "Whether we should show stdout from the running application server. By default only the test runner's stdout is shown.",
    false,
  )
  .option(
    "--skip-build",
    "Skip building Docker images (use pre-built images already loaded into Docker)",
    false,
  )
  .option(
    "--shard <index/total>",
    "Run only one shard of the suite, e.g. '2/4': its specs are split into <total> shards of similar duration (see the 'shards' command)",
  )
  .action(async (test_suite_name: string, options): Promise<void> => {
    const test_suites: readonly string[] = listTestSuites();
    if (!test_suites.includes(test_suite_name)) {
      console.error(`No test suite found with name '${test_suite_name}'!`);
      process.exit(404);
    }

    let specs: string[] | undefined;
    if (typeof options.shard === "string") {
      const { index, total } = parseShardSelector(options.shard);
      const shard = planSuiteShards(test_suite_name, total)[index - 1];
      if (shard.specs.length === 0) {
        console.warn(
          `[e2e-auth-tests-cli] Shard ${index}/${total} of suite '${test_suite_name}' has no specs (the suite has fewer specs than shards); nothing to run.`,
        );
        process.exit(0);
      }
      console.log(
        `[e2e-auth-tests-cli] Running shard ${index}/${total} of suite '${test_suite_name}' (~${Math.round(shard.estimated_seconds / 60)} min of specs):\n${shard.specs.map((spec) => `\t- ${spec}`).join("\n")}`,
      );
      specs = shard.specs;
    }

    const dockerComposeProfile: string = suiteNeedsExampleResourceServer(
      test_suite_name,
    )
      ? ("e2e_with_resource_server" as const)
      : ("e2e" as const);

    // args for the `docker compose up` command that launches the e2e test
    const args: string[] = [
      "--abort-on-container-exit",
      "--exit-code-from",
      "schemavaults-e2e-auth-tests",
      "--force-recreate",
    ];

    // skip build flag - when true, use pre-built images already loaded into Docker
    const skipBuild: boolean =
      typeof options.skipBuild === "boolean" && options.skipBuild ? true : false;
    if (!skipBuild) {
      args.push("--build");
    }

    // verbose flag
    const verbose: boolean =
      typeof options.verbose === "boolean" && options.verbose ? true : false;
    if (!verbose) {
      // attach to only the test runner if not verbose
      args.push("--attach", "schemavaults-e2e-auth-tests");
    } else {
      console.log("--verbose flag is active! Attaching to all containers...");
    }

    await launchDockerComposeTests(
      test_suite_name,
      dockerComposeProfile,
      specs,
      ...args,
    );
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

e2eAuthTestsCli
  .command("shards")
  .description(
    "Show how 'e2e <test_suite> --shard <index>/<total>' splits a suite's specs",
  )
  .argument("<test_suite>", "Name of the test suite")
  .argument("<total>", "Number of shards")
  .action((test_suite_name: string, total: string): void => {
    if (!listTestSuites().includes(test_suite_name)) {
      console.error(`No test suite found with name '${test_suite_name}'!`);
      process.exit(404);
    }
    const shards = planSuiteShards(test_suite_name, Number(total));
    shards.forEach((shard, i) => {
      console.log(
        `Shard ${i + 1}/${shards.length} (~${Math.round(shard.estimated_seconds)}s):`,
      );
      for (const spec of shard.specs) {
        const recorded = E2E_SPEC_DURATIONS_SECONDS[test_suite_name]?.[spec];
        console.log(
          `\t- ${spec} (${recorded === undefined ? "no recorded duration" : `${recorded}s`})`,
        );
      }
    });
  });

async function main(): Promise<void> {
  await e2eAuthTestsCli.parseAsync();
}

main();
