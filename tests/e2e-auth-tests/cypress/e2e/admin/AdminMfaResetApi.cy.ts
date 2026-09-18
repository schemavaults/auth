// Covers the admin MFA reset endpoint and the admin factor listing beyond
// their guards:
//   GET    /api/admin/users/[uid]/mfa   -> factor types for a user
//   DELETE /api/admin/users/[uid]/mfa   -> wipes every factor (account recovery)
// The reset is verified end to end: a TOTP-enrolled user whose login returns
// `mfa_required` logs straight in with `kind: "authenticated"` once an admin
// has reset their factors.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface AdminMfaFactorsResponseBody {
  success: boolean;
  message?: string;
  data?: { factor_types: string[] };
}

interface LoginResponseBody {
  kind?: string;
  success?: boolean;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const NONEXISTENT_UID = "00000000-0000-0000-0000-000000000099";

function loginAsSuperuser(): void {
  cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
    if (!ok) throw new Error("Failed to login as superuser");
  });
}

/** Raw POST /api/auth/login so the `kind` discriminator can be inspected. */
function attemptLogin(
  email: string,
  password: string,
): Cypress.Chainable<Cypress.Response<LoginResponseBody>> {
  cy.reset_rate_limit();
  const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
  return cy
    .wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
      PKCE_ProofKeyManager.createCodeChallenge(verifier),
      { log: false },
    )
    .then((challenge) =>
      cy.request<LoginResponseBody>({
        method: "POST",
        url: "/api/auth/login",
        failOnStatusCode: false,
        body: {
          credentials: { email, password },
          client_app_id: AUTH_APP_ID,
          code_challenge: challenge.code_challenge,
          challenge_time: challenge.challenge_time,
          nonce: `e2e-nonce-${Date.now()}`,
          scope: DEFAULT_AUTH_SCOPE,
        },
      }),
    );
}

describe("Admin MFA reset API", () => {
  it("rejects a malformed uid (400) and an unknown uid (404) on GET and DELETE", () => {
    loginAsSuperuser();
    for (const method of ["GET", "DELETE"] as const) {
      cy.request({
        method,
        url: "/api/admin/users/not-a-uuid/mfa",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, `${method} malformed uid`).to.eq(400);
        expect(response.body).to.have.property("success", false);
      });
      cy.request({
        method,
        url: `/api/admin/users/${NONEXISTENT_UID}/mfa`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, `${method} unknown uid`).to.eq(404);
        expect(response.body).to.have.property("success", false);
      });
    }
  });

  it("lists a user's enrolled factor types and resets them so MFA is no longer required at login", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (created: boolean) => {
          expect(created, "regular user registration").to.be.true;
          cy.logout();

          cy.enroll_test_user_mfa({ email: credentials.email }).then(
            ({ uid }) => {
              // Sanity check: the seeded factor gates login.
              attemptLogin(credentials.email, credentials.password).then(
                (response) => {
                  expect(response.status).to.eq(200);
                  expect(response.body.kind).to.eq("mfa_required");
                },
              );

              loginAsSuperuser();
              cy.request<AdminMfaFactorsResponseBody>({
                method: "GET",
                url: `/api/admin/users/${uid}/mfa`,
              }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body.success).to.eq(true);
                expect(response.body.data?.factor_types).to.deep.equal([
                  "totp",
                ]);
              });

              cy.request<AdminMfaFactorsResponseBody>({
                method: "DELETE",
                url: `/api/admin/users/${uid}/mfa`,
              }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body.success).to.eq(true);
              });

              cy.request<AdminMfaFactorsResponseBody>({
                method: "GET",
                url: `/api/admin/users/${uid}/mfa`,
              }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body.data?.factor_types).to.deep.equal([]);
              });
              cy.logout();

              attemptLogin(credentials.email, credentials.password).then(
                (response) => {
                  expect(response.status).to.eq(200);
                  expect(
                    response.body.kind,
                    "login after admin MFA reset",
                  ).to.eq("authenticated");
                },
              );
            },
          );
        },
      );
    });
  });
});
