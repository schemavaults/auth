// ServiceAccountEmailDomain.cy.ts
//
// The domain of service-account emails (the subjects of OAuth2
// client_credentials tokens — see auth-server/src/lib/config/
// service-account-email-domain.ts) is reserved: no person may register an
// account under it, whatever the local part and whatever the casing.
// This spec covers the built-in default domain (`service-accounts.invalid`);
// the admin suite's ServiceAccountEmailDomainSetting spec covers a
// configured domain and proves the default stays reserved alongside it.
//
// The guard is checked BEFORE invite-code handling would matter for the
// outcome, but a valid invite code is still provisioned when the server
// requires one, so the only reason for the refusal is the email domain.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

const DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN = "service-accounts.invalid";
const EXPECTED_MESSAGE =
  "This email domain is reserved for service accounts. Please register with a different email address.";

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

function provisionInviteCodeIfRequired(): Cypress.Chainable<
  string | undefined
> {
  return cy
    .is_invite_code_required()
    .then((required: boolean): Cypress.Chainable<string | undefined> => {
      if (!required) {
        return cy.wrap<string | undefined>(undefined, { log: false });
      }
      return cy
        .as_admin((): Cypress.Chainable<string> => {
          return cy.generate_random_code(24).then((invite_code: string) => {
            return cy
              .create_invite_code(invite_code, 1)
              .then((created: boolean) => {
                if (!created) {
                  throw new Error("Failed to create invite code!");
                }
                return cy.wrap(invite_code, { log: false });
              });
          });
        })
        .then((invite_code: string): Cypress.Chainable<string | undefined> => {
          cy.logout();
          return cy.wrap<string | undefined>(invite_code, { log: false });
        });
    });
}

describe("Service-account email domain is reserved at registration", () => {
  it("refuses to register a person under the default service-account domain", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      const [local_part] = credentials.email.split("@");
      const reserved_email = `${local_part}@${DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN}`;

      provisionInviteCodeIfRequired().then((invite_code) => {
        cy.register_via_request(
          reserved_email,
          credentials.password,
          invite_code,
        ).then((status: number) => {
          expect(status, "registration status").to.equal(400);
        });

        // The refusal names the reason (not a generic validation error).
        registerRaw(
          `${local_part}-2@${DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN}`,
          credentials.password,
          invite_code,
        ).then((response) => {
          expect(response.status, "status").to.equal(400);
          expect(response.body.kind, "kind").to.equal("failure");
          expect(response.body.message, "message").to.equal(EXPECTED_MESSAGE);
        });
      });
    });
  });

  it("refuses casing variants of the reserved domain too", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      const [local_part] = credentials.email.split("@");
      provisionInviteCodeIfRequired().then((invite_code) => {
        cy.register_via_request(
          `${local_part}@Service-Accounts.INVALID`,
          credentials.password,
          invite_code,
        ).then((status: number) => {
          expect(status, "registration status").to.equal(400);
        });
      });
    });
  });

  it("still registers a person under an ordinary domain (control)", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (registered: boolean) => {
          expect(registered, "ordinary registration").to.be.true;
        },
      );
    });
  });
});
