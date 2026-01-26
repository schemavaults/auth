import { defineConfig } from "cypress";
import { createJwksAccessProofToken, importPKCS8 } from "@schemavaults/jwt";

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

        if (environment === "test") {
          await (async function triggerTestEnvironmentDbMigration(): Promise<void> {
            const endpoint: string = `${config.baseUrl}/api/admin/migrate-test-environment-db`;
            console.log(
              "[triggerTestEnvironmentDbMigration] Sending POST request to: ",
              endpoint,
            );
            try {
              const response = await fetch(endpoint, {
                method: "POST",
              });
              if (response.status !== 200) {
                throw new Error(
                  "Received bad response status " +
                    response.status +
                    " " +
                    response.statusText,
                );
              }
            } catch (e: unknown) {
              console.error(
                "Failed to trigger test environment DB migration: ",
                e,
              );
              throw new Error(
                "Failed to trigger test environment DB migration!",
              );
            }

            console.log(
              `[triggerTestEnvironmentDbMigration] DB migration appears to have been a success!`,
            );
          })();
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
  },
});
