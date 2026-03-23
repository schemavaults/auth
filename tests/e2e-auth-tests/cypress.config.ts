import { defineConfig } from "cypress";
import { createJwksAccessProofToken, importPKCS8 } from "@schemavaults/jwt";
import { PKCE_ProofKeyManager } from "@schemavaults/auth-common";

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
            let result: object;
            try {
              const response = await fetch(endpoint, {
                method: "POST",
              });
              if (response.status !== 200) {
                try {
                  const body = await response.json();
                  console.error(body);
                } catch (e: unknown) {
                  void e;
                }
                throw new Error(
                  "Received bad response status " +
                    response.status +
                    " " +
                    response.statusText,
                );
              }

              const response_body = await response.json();
              if (typeof response_body !== "object" || !response_body) {
                throw new TypeError(
                  "Expected response body to be a JSON object!",
                );
              }
              result = response_body;
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
              `[triggerTestEnvironmentDbMigration] DB migration appears to have been a success: `,
              result,
            );
          })();

          // Pre-register the superuser for non-superuser test suites
          // so that create_and_login_as_superuser() can skip the slow
          // register-then-409-then-login dance and go straight to login.
          const testSuiteName = config.env["TEST_SUITE_NAME"];
          if (testSuiteName !== "superuser") {
            await (async function preRegisterSuperuser(): Promise<void> {
              const endpoint = `${config.baseUrl}/api/auth/register`;
              console.log(
                `[preRegisterSuperuser] Pre-registering superuser for test suite '${testSuiteName}'...`,
              );

              const challenge_time = Date.now();
              const codeVerifier =
                PKCE_ProofKeyManager.createCodeVerifier(challenge_time);
              const codeChallenge =
                await PKCE_ProofKeyManager.createCodeChallenge(codeVerifier);

              const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  credentials: {
                    email: config.env["PRIVATE_SUPERUSER_EMAIL"],
                    password: config.env["PRIVATE_SUPERUSER_PASSWORD"],
                  },
                  invite_code: config.env["PRIVATE_SUPERUSER_INVITE_CODE"],
                  code_challenge: codeChallenge.code_challenge,
                  challenge_time,
                }),
              });

              if (response.status === 200) {
                console.log(
                  "[preRegisterSuperuser] Superuser registered successfully.",
                );
                config.env["PRIVATE_SUPERUSER_PRECREATED"] = true;
              } else if (response.status === 409) {
                console.log("[preRegisterSuperuser] Superuser already exists.");
                config.env["PRIVATE_SUPERUSER_PRECREATED"] = true;
              } else {
                const body = await response.json().catch(() => null);
                console.error(
                  "[preRegisterSuperuser] Failed:",
                  response.status,
                  body,
                );
                throw new Error(
                  `Failed to pre-register superuser! Status: ${response.status}`,
                );
              }
            })();
          }

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
  },
});
