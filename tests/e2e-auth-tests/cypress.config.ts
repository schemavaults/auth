import { defineConfig } from "cypress";
import {
  createJwksAccessProofToken,
  importPKCS8,
  SignJWT,
  type JWTPayload,
} from "@schemavaults/jwt";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  getAuthServerUrl,
} from "@schemavaults/app-definitions";
import {
  NobleCryptoPlugin,
  ScureBase32Plugin,
  createGuardrails,
  generateSync as generateTotpSync,
} from "otplib";
import triggerTestEnvironmentDbMigration from "./cypress/support/triggerTestEnvironmentDbMigration";
import preRegisterSuperuser from "./cypress/support/pre-register-superuser";
import seedAppAndApiForExampleResourceServer from "./cypress/support/seed-app-and-api-for-example-resource-server";

// Crypto + base32 plugins for otplib v13's plugin-based API. The
// auth-server uses otplib's default settings (SHA-1 / 6 digits / 30 s
// period / Base32-encoded secret), so the no-arg defaults match here.
const totpCryptoPlugin = new NobleCryptoPlugin();
const totpBase32Plugin = new ScureBase32Plugin();

// otplib v12 (used by the auth-server) defaults to a 10-byte (80-bit)
// shared secret per RFC 4226's lower bound, but otplib v13 enforces the
// RFC 6238 recommendation of ≥ 16 bytes by default. Loosen the lower
// bound here so codes generated against the seeded test secret verify
// against the server-side check that issued it.
const totpTestGuardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

const devAuthServer: string = "http://localhost:6767";

// The auth server URL is the token audience/issuer for auth-server tokens and
// the `aud` claim of JWKS access proof tokens. Resolved here (Node context)
// because getAppEnvironment() throws in the specs' browser context; specs read
// it via Cypress.env("AUTH_SERVER_URL"). Falls back to the local dev server
// when no SCHEMAVAULTS_APP_ENVIRONMENT/NODE_ENV is configured (bun run open).
function resolveAuthServerUrl(): string {
  try {
    return getAuthServerUrl();
  } catch {
    return devAuthServer;
  }
}

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
            auth_server_url: resolveAuthServerUrl(),
            private_key: privateKey,
          });
        },
        // Sign a JWKS access assertion with full control over the claim set
        // so specs can exercise the auth server's hardened claim validation
        // (missing exp, expired, mismatched aud/iss, ...). The production
        // mint path (createJwksAccessProofToken) refuses to emit malformed
        // assertions, so the bad claims have to be signed here directly.
        async signCustomJwksAccessAssertion({
          private_key_pem,
          claims,
        }: {
          private_key_pem: string;
          claims: Record<string, unknown>;
        }): Promise<string> {
          const privateKey = await importPKCS8(private_key_pem, "RS256");
          return await new SignJWT(claims as JWTPayload)
            .setProtectedHeader({ alg: "RS256" })
            .sign(privateKey);
        },
        // otplib's HMAC implementation depends on Node's `crypto.createHmac`,
        // which doesn't exist inside Cypress's browser context. Compute the
        // TOTP here on the Node side and hand the string back to the spec.
        computeTotpCode(secret: string): string {
          if (typeof secret !== "string" || secret.length === 0) {
            throw new TypeError("computeTotpCode requires a non-empty secret");
          }
          return generateTotpSync({
            secret,
            crypto: totpCryptoPlugin,
            base32: totpBase32Plugin,
            guardrails: totpTestGuardrails,
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
            await preRegisterSuperuser(
              auth_server_url,
              testSuiteName,
              {
                email: config.env["PRIVATE_SUPERUSER_EMAIL"],
                password: config.env["PRIVATE_SUPERUSER_PASSWORD"],
                confirm: config.env["PRIVATE_SUPERUSER_PASSWORD"],
                invite_code: config.env["PRIVATE_SUPERUSER_INVITE_CODE"],
              },
              config.env["SCHEMAVAULTS_AUTH_SERVER_APP_ID"],
            );
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
    AUTH_SERVER_URL: resolveAuthServerUrl(),
    // The auth server deployment's own app id, for running the suite against
    // a white-label deployment (e.g. "acme-corp-auth"). Set it to the same
    // value as the auth server's SCHEMAVAULTS_AUTH_SERVER_APP_ID environment
    // variable (also overridable via CYPRESS_SCHEMAVAULTS_AUTH_SERVER_APP_ID).
    // Specs/commands read it via getAuthServerAppIdFromCypressEnv() from
    // @schemavaults/cypress-e2e-auth-tests-helper-commands.
    // `||` (not `??`) so an empty-string env value (e.g. from docker-compose
    // `${VAR:-}` interpolation) also falls back to the default app id.
    SCHEMAVAULTS_AUTH_SERVER_APP_ID:
      process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID ||
      DEFAULT_AUTH_SERVER_APP_ID,
    // Expected white-label branding values for the white_label suite, so
    // specs assert against the same values injected into the auth server
    // container (single source of truth: e2e-auth-tests-cli.ts). Empty when
    // the deployment under test runs stock branding.
    SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME:
      process.env.SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME ?? "",
    SCHEMAVAULTS_AUTH_SERVER_DESCRIPTION:
      process.env.SCHEMAVAULTS_AUTH_SERVER_DESCRIPTION ?? "",
    SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1:
      process.env.SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1 ?? "",
    SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2:
      process.env.SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2 ?? "",
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
