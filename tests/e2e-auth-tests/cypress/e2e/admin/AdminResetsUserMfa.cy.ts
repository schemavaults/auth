// Verifies the admin MFA-reset escape hatch:
// DELETE /api/admin/users/:uid/mfa
// (auth-server/src/app/api/admin/users/[uid]/mfa/route.ts →
// MfaRegistry.deleteAllFactorsForUser) must actually clear the target user's
// verified factors, so a user who has lost their authenticator can be let back
// in by an administrator.
//
// Existing coverage only asserts the 403 for authenticated non-admins
// (RegularUserAdminApiForbidden.cy.ts). The success path — the part that
// decides whether a locked-out user can recover their account — had none, and
// the endpoint has no UI caller today, so nothing else exercises it.
//
// The assertion that matters is the observable end state: the login gate that
// returned `mfa_required` before the reset returns `authenticated` after it.

import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";
import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface LoginResponseBody {
  kind?: string;
  success?: boolean;
  message?: string;
}

interface AdminUserMfaResponseBody {
  success: boolean;
  data?: { factor_types: string[] };
}

// Module marker: keeps this spec's top-level interfaces file-scoped so they do
// not collide with same-named interfaces in other spec files.
export {};

// POSTs directly to /api/auth/login and hands back the response body without
// asserting which variant came back — this spec needs to distinguish
// `mfa_required` from `authenticated`, which cy.login_via_request() collapses
// into a single boolean.
function loginRequest(
  email: string,
  password: string,
): Cypress.Chainable<LoginResponseBody> {
  cy.reset_rate_limit();

  const code_verifier_with_details = PKCE_ProofKeyManager.createCodeVerifier(
    Date.now(),
  );

  return cy
    .wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
      PKCE_ProofKeyManager.createCodeChallenge(code_verifier_with_details),
      { log: false },
    )
    .then((challenge: CodeChallengeWithDetails) =>
      cy.request({
        method: "POST",
        url: "/api/auth/login",
        failOnStatusCode: false,
        body: {
          credentials: { email, password },
          client_app_id: AUTH_APP_ID,
          code_challenge: challenge.code_challenge,
          challenge_time: challenge.challenge_time,
          // crypto.randomUUID() is unavailable in the spec's browser context
          // (insecure http:// in CI); use clock + Math.random instead.
          nonce: `e2e-nonce-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`,
          scope: DEFAULT_AUTH_SCOPE,
        },
      }),
    )
    .then((response) => {
      expect(response.status, "POST /api/auth/login should return 200").to.equal(
        200,
      );
      return cy.wrap(response.body as LoginResponseBody, { log: false });
    });
}

describe("Admin resets a user's MFA factors", () => {
  it("DELETE /api/admin/users/:uid/mfa clears the verified factor so the user's next login is no longer MFA-gated", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(
            loggedIn,
            "create_and_login_as_regular_user_via_request should succeed",
          ).to.be.true;
          // Drop the freshly-registered user's session: the login endpoint
          // rejects a login for a different user while one is signed in (403).
          cy.clearCookies();

          cy.enroll_test_user_mfa({ email: credentials.email }).then((mfa) => {
            const target_uid: string = mfa.uid;

            // Pre-condition: the MFA gate is active for this user.
            loginRequest(credentials.email, credentials.password).then(
              (body) => {
                expect(
                  body.kind,
                  "login before the admin reset should be gated by MFA",
                ).to.equal("mfa_required");
              },
            );
            cy.clearCookies();

            cy.create_and_login_as_superuser_via_request().then(
              (adminLoggedIn: boolean) => {
                expect(adminLoggedIn, "superuser login should succeed").to.be
                  .true;

                cy.request<AdminUserMfaResponseBody>({
                  method: "GET",
                  url: `/api/admin/users/${target_uid}/mfa`,
                  failOnStatusCode: false,
                }).then((response) => {
                  expect(response.status).to.equal(200);
                  expect(response.body.success).to.be.true;
                  expect(
                    response.body.data?.factor_types,
                    "the seeded TOTP factor should be visible to the admin before the reset",
                  ).to.include("totp");
                });

                // The call under test.
                cy.request({
                  method: "DELETE",
                  url: `/api/admin/users/${target_uid}/mfa`,
                  failOnStatusCode: false,
                }).then((response) => {
                  expect(
                    response.status,
                    "admin MFA reset should return 200",
                  ).to.equal(200);
                  expect(response.body).to.have.property("success", true);
                });

                cy.request<AdminUserMfaResponseBody>({
                  method: "GET",
                  url: `/api/admin/users/${target_uid}/mfa`,
                  failOnStatusCode: false,
                }).then((response) => {
                  expect(response.status).to.equal(200);
                  expect(
                    response.body.data?.factor_types,
                    "no verified factors should remain after the admin reset",
                  )
                    .to.be.an("array")
                    .that.is.empty;
                });
              },
            );

            // Drop the admin session before authenticating as the target user.
            cy.clearCookies();

            loginRequest(credentials.email, credentials.password).then(
              (body) => {
                expect(
                  body.kind,
                  "login after the admin reset should no longer require MFA",
                ).to.equal("authenticated");
              },
            );
          });
        },
      );
    });
  });
});
