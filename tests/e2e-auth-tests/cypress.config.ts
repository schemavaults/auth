import { defineConfig } from "cypress";
import { createJwksAccessProofToken, importPKCS8 } from "@schemavaults/jwt";
import triggerTestEnvironmentDbMigration from "./cypress/support/triggerTestEnvironmentDbMigration";
import preRegisterSuperuser from "./cypress/support/pre-register-superuser";
import seedAppAndApiForExampleResourceServer from "./cypress/support/seed-app-and-api-for-example-resource-server";

const devAuthServer: string = "http://localhost:6767";

export default defineConfig({
  e2e: {
    baseUrl: devAuthServer,
    setupNodeEvents(on, config): void {
      on("task", {
        async createJwksAccessProofToken({
          api_server_id,
          private_key_pem,
        }: {
          api_server_id: string;
          private_key_pem: string;
        }): Promise<string> {
          const privateKey = await importPKCS8(private_key_pem, "RS256");
          return createJwksAccessProofToken({
            api_server_id,
            private_key: privateKey,
          });
        },
      });

      on("before:run", async () => {
        const environment = config.env["SCHEMAVAULTS_APP_ENVIRONMENT"];
        if (
          !["development", "test", "staging", "production"].includes(
            environment,
          )
        ) {
          throw new TypeError(
            "Failed to parse SCHEMAVAULTS_APP_ENVIRONMENT from Cypress config!",
          );
        }
        const auth_server_url: string = config.baseUrl!;
        if (!auth_server_url || typeof auth_server_url !== "string") {
          throw new TypeError(
            "Failed to load auth server URL from Cypress config!",
          );
        }

        if (environment === "test") {
          await triggerTestEnvironmentDbMigration(auth_server_url);

          // Pre-register the superuser for non-superuser test suites
          // so that create_and_login_as_superuser() can skip the slow
          // register-then-409-then-login dance and go straight to login.
          const testSuiteName = config.env["TEST_SUITE_NAME"];
          if (testSuiteName !== "superuser") {
            await preRegisterSuperuser(auth_server_url, testSuiteName, {
              email: config.env["PRIVATE_SUPERUSER_EMAIL"],
              password: config.env["PRIVATE_SUPERUSER_PASSWORD"],
              confirm: config.env["PRIVATE_SUPERUSER_PASSWORD"],
              invite_code: config.env["PRIVATE_SUPERUSER_INVITE_CODE"],
            });
            config.env["PRIVATE_SUPERUSER_PRECREATED"] = true;
          }

          if (testSuiteName === "example_resource_server") {
            if (
              !config.env[
                "EXAMPLE_NEXTJS_RESOURCE_SERVER_JWKS_ACCESS_PUBLIC_KEY"
              ]
            ) {
              throw new Error(
                "Missing environment variable EXAMPLE_NEXTJS_RESOURCE_SERVER_JWKS_ACCESS_PUBLIC_KEY, which is required for this test suite!",
              );
            }

            await seedAppAndApiForExampleResourceServer(
              auth_server_url,
              "00000000-0000-0000-0000-000000000000",
              config.env["EXAMPLE_NEXTJS_RESOURCE_SERVER_URL"],
              config.env[
                "EXAMPLE_NEXTJS_RESOURCE_SERVER_JWKS_ACCESS_PUBLIC_KEY"
              ],
            );
          } // end of setup for test suite 'example_resource_server'

          return;
        } else {
          // dont trigger migration in non-test environment
          return;
        }
      });
    },
  },
  env: {
    PRIVATE_SUPERUSER_INVITE_CODE: "superuser",
    PRIVATE_SUPERUSER_EMAIL: "admin@schemavaults.com",
    PRIVATE_SUPERUSER_PASSWORD: "Password123!",
    SCHEMAVAULTS_APP_ENVIRONMENT:
      process.env.SCHEMAVAULTS_APP_ENVIRONMENT ?? "development",
    TEST_SUITE_NAME: process.env.TEST_SUITE_NAME ?? "",
    PRIVATE_SUPERUSER_PRECREATED: false,
    EXAMPLE_NEXTJS_RESOURCE_SERVER_URL:
      process.env.EXAMPLE_NEXTJS_RESOURCE_SERVER_URL ?? "http://localhost:3007",
    EXAMPLE_NEXTJS_RESOURCE_SERVER_JWKS_ACCESS_PUBLIC_KEY:
      process.env.EXAMPLE_NEXTJS_RESOURCE_SERVER_JWKS_ACCESS_PUBLIC_KEY ?? "",
  },
});
