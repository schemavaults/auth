// ServiceAccountEmailDomainSetting.cy.ts
//
// The `service_account_email_domain` server setting (auth-server/src/lib/
// auth-db/server-settings/server-setting-keys.ts): admins may point the
// synthetic service-account email domain at one they control, the value
// must be a bare hostname, and BOTH the configured domain and the
// built-in default (`service-accounts.invalid`) stay unregistrable by
// people. The setting is restored to its default after every test so the
// change cannot leak into other specs.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

const SETTING_KEY = "service_account_email_domain";
const DEFAULT_DOMAIN = "service-accounts.invalid";
const CUSTOM_DOMAIN = "service-accounts.auth.example.com";
const EXPECTED_MESSAGE =
  "This email domain is reserved for service accounts. Please register with a different email address.";

interface PatchSettingResponseBody {
  success: boolean;
  message?: string;
  data?: { key: string; value: unknown };
}

interface ListSettingsResponseBody {
  success: boolean;
  data?: { settings: { key: string; value: unknown }[] };
}

interface RegisterFailureBody {
  kind?: string;
  success?: boolean;
  message?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

/**
 * Posts a register request directly (mirroring cy.register_via_request)
 * so the response BODY can be asserted, not just the status.
 */
function registerRaw(
  email: string,
  password: string,
  invite_code: string | undefined,
): Cypress.Chainable<Cypress.Response<RegisterFailureBody>> {
  const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
  return cy
    .wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
      PKCE_ProofKeyManager.createCodeChallenge(verifier),
      { log: false },
    )
    .then((challenge) =>
      cy.request<RegisterFailureBody>({
        method: "POST",
        url: "/api/auth/register",
        failOnStatusCode: false,
        body: {
          credentials: { email, password },
          client_app_id: getAuthServerAppIdFromCypressEnv(),
          code_challenge: challenge.code_challenge,
          challenge_time: challenge.challenge_time,
          nonce: `e2e-nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          scope: DEFAULT_AUTH_SCOPE,
          ...(invite_code ? { invite_code } : {}),
        },
      }),
    );
}

function patchDomain(
  value: unknown,
): Cypress.Chainable<Cypress.Response<PatchSettingResponseBody>> {
  return cy.request<PatchSettingResponseBody>({
    method: "PATCH",
    url: `/api/admin/settings/${SETTING_KEY}`,
    body: { value },
    failOnStatusCode: false,
  });
}

function currentDomain(): Cypress.Chainable<unknown> {
  return cy
    .request<ListSettingsResponseBody>({
      method: "GET",
      url: "/api/admin/settings",
    })
    .then((response) => {
      const setting = response.body.data?.settings.find(
        (s) => s.key === SETTING_KEY,
      );
      return cy.wrap(setting?.value, { log: false });
    });
}

describe("service_account_email_domain server setting", () => {
  beforeEach(() => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  });

  afterEach(() => {
    // Always restore the default, even if an assertion failed midway. The
    // last test signs out to exercise registration, so re-authenticate
    // only when needed (the login helper asserts a signed-out state).
    cy.is_authenticated().then((authenticated: boolean) => {
      if (!authenticated) {
        cy.create_and_login_as_superuser_via_request();
      }
      patchDomain(DEFAULT_DOMAIN);
    });
  });

  it("defaults to the reserved .invalid domain", () => {
    currentDomain().then((value) => {
      expect(value, "default value").to.equal(DEFAULT_DOMAIN);
    });
  });

  it("rejects values that are not a bare hostname", () => {
    for (const bad of [
      "https://service-accounts.example.com",
      "service-accounts.example.com/",
      "svc@service-accounts.example.com",
      "localhost",
      "",
      "-bad.example.com",
    ]) {
      patchDomain(bad).then((response) => {
        expect(response.status, `PATCH ${JSON.stringify(bad)}`).to.equal(400);
        expect(response.body.success, "success").to.equal(false);
      });
    }
    currentDomain().then((value) => {
      expect(value, "value after rejected updates").to.equal(DEFAULT_DOMAIN);
    });
  });

  it("accepts a domain the operator controls, normalizing its case", () => {
    patchDomain("Service-Accounts.Auth.Example.COM").then((response) => {
      expect(response.status, "status").to.equal(200);
      expect(response.body.success, "success").to.equal(true);
      expect(response.body.data?.value, "stored value").to.equal(CUSTOM_DOMAIN);
    });
    currentDomain().then((value) => {
      expect(value, "listed value").to.equal(CUSTOM_DOMAIN);
    });
  });

  it("keeps both the configured domain and the default unregistrable", () => {
    patchDomain(CUSTOM_DOMAIN).then((response) => {
      expect(response.status, "PATCH status").to.equal(200);
    });

    // Registration must happen signed out (the register API refuses
    // requests from an existing session), with a valid invite code when
    // the server requires one so the domain is the only reason to refuse.
    cy.is_invite_code_required().then((required: boolean) => {
      const inviteCode: Cypress.Chainable<string | undefined> = required
        ? cy.generate_random_code(24).then((code: string) =>
            cy.create_invite_code(code, 2).then((created: boolean) => {
              if (!created) throw new Error("Failed to create invite code!");
              return cy.wrap<string | undefined>(code, { log: false });
            }),
          )
        : cy.wrap<string | undefined>(undefined, { log: false });

      inviteCode.then((invite_code) => {
        cy.logout();
        cy.generate_random_test_user_credentials().then((credentials) => {
          const [local_part] = credentials.email.split("@");

          cy.register_via_request(
            `${local_part}@${CUSTOM_DOMAIN}`,
            credentials.password,
            invite_code,
          ).then((status: number) => {
            expect(status, "configured domain").to.equal(400);
          });

          cy.register_via_request(
            `${local_part}@${DEFAULT_DOMAIN}`,
            credentials.password,
            invite_code,
          ).then((status: number) => {
            expect(status, "default domain stays reserved").to.equal(400);
          });

          registerRaw(
            `${local_part}-x@${CUSTOM_DOMAIN}`,
            credentials.password,
            invite_code,
          ).then((response) => {
            expect(response.status, "status").to.equal(400);
            expect(response.body.message, "message").to.equal(
              EXPECTED_MESSAGE,
            );
          });
        });
      });
    });
  });
});
