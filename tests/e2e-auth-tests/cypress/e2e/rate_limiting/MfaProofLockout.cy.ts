// Failed MFA proofs are capped per account (10 per hour), counted across the
// step-up proofs (recovery code regeneration, factor removal) and the login
// challenge: without the cap a 6-digit TOTP code falls to an attacker who
// holds a stolen session (no challenge needed) or the password plus many
// IPs. Once spent, every proof is refused with 429, the right code included.
//
// cy.reset_rate_limit() clears these counters too, so nothing between the
// failures and the assertions may call a helper that resets them.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();
const WRONG_CODE = "000000";
const MFA_PROOF_FAILURE_BUDGET = 10;

interface MfaEnrollResponseBody {
  factor_id: string;
  secret: string;
}

interface LoginResponseBody {
  kind?: string;
  challenge_id?: string;
}

/** Enrolls and confirms a TOTP factor for the signed-in user. */
function enrollTotpViaApi(): Cypress.Chainable<{ factor_id: string; secret: string }> {
  return cy
    .request<MfaEnrollResponseBody>({ method: "POST", url: "/api/user/mfa/totp/enroll" })
    .then((enroll) => {
      expect(enroll.status).to.eq(200);
      const { factor_id, secret } = enroll.body;
      return cy.compute_totp_code(secret).then((code) =>
        cy
          .request({
            method: "POST",
            url: "/api/user/mfa/totp/verify-enrollment",
            body: { factor_id, code },
          })
          .then((verify) => {
            expect(verify.status).to.eq(200);
            return { factor_id, secret };
          }),
      );
    });
}

/** Raw POST /api/auth/login, without resetting the rate limits first. */
function loginForMfaChallenge(email: string, password: string): Cypress.Chainable<string> {
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
        body: {
          credentials: { email, password },
          client_app_id: AUTH_APP_ID,
          code_challenge: challenge.code_challenge,
          challenge_time: challenge.challenge_time,
          nonce: `e2e-nonce-${Date.now()}`,
          scope: DEFAULT_AUTH_SCOPE,
        },
      }),
    )
    .then((response) => {
      expect(response.body.kind, "login asks for the second factor").to.eq("mfa_required");
      expect(response.body.challenge_id).to.be.a("string");
      return response.body.challenge_id as string;
    });
}

function expectLockedOut(response: Cypress.Response<unknown>, what: string): void {
  expect(response.status, `${what} is refused while the budget is spent`).to.eq(429);
  expect(response.headers["x-ratelimit-limit"]).to.eq(String(MFA_PROOF_FAILURE_BUDGET));
  expect(Number(response.headers["retry-after"])).to.be.greaterThan(0);
}

describe("MFA proof failure lockout (10/hour per account)", () => {
  it("refuses every MFA proof of the account once 10 have failed, across endpoints", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) => {
        expect(ok, "regular user registration + login").to.be.true;
        cy.reset_rate_limit();

        enrollTotpViaApi().then(({ factor_id, secret }) => {
          // Spread the failures over both step-up endpoints: they share one budget.
          for (let i = 1; i <= MFA_PROOF_FAILURE_BUDGET; i++) {
            const regenerate = i % 2 === 1;
            cy.request({
              method: regenerate ? "POST" : "DELETE",
              url: regenerate ? "/api/user/mfa/recovery-codes/regenerate" : `/api/user/mfa/totp/${factor_id}`,
              body: regenerate ? { factor_id, code: WRONG_CODE } : { code: WRONG_CODE },
              failOnStatusCode: false,
            })
              .its("status")
              .should("eq", 401);
          }

          cy.compute_totp_code(secret).then((code: string) => {
            // The right code is refused too, and not consumed: the lockout
            // answers before the code is checked.
            cy.request({
              method: "POST",
              url: "/api/user/mfa/recovery-codes/regenerate",
              body: { factor_id, code },
              failOnStatusCode: false,
            }).then((response) => expectLockedOut(response, "regenerating recovery codes"));
            cy.request({
              method: "DELETE",
              url: `/api/user/mfa/totp/${factor_id}`,
              body: { code },
              failOnStatusCode: false,
            }).then((response) => expectLockedOut(response, "removing the factor"));

            // The login challenge draws on the same budget.
            cy.clearCookies();
            loginForMfaChallenge(credentials.email, credentials.password).then((challenge_id) => {
              cy.request({
                method: "POST",
                url: "/api/auth/mfa/verify",
                body: {
                  challenge_id,
                  client_app_id: AUTH_APP_ID,
                  proof: { type: "totp", factor_id, code },
                },
                failOnStatusCode: false,
              }).then((response) => expectLockedOut(response, "the login challenge"));
            });
          });
        });
      });
    });
  });
});
