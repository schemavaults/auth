// Request-level coverage of the login MFA challenge contract:
//   POST /api/auth/login              -> the `mfa_required` response body and
//                                        the absence of session cookies
//   POST /api/auth/mfa/verify         -> client_app_id mismatch (400), unknown
//                                        or consumed challenge (410, incl.
//                                        replay after success), recovery-code
//                                        single use, body validation (400),
//                                        cookies + authorization_code on success
//   POST /api/auth/mfa/webauthn/options -> 409 without passkeys, 410 unknown
//                                        challenge, 400 client_app_id mismatch
// The UI-driven flows live in Mfa.cy.ts; this file pins the JSON contracts.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
  RefreshTokenCookieName,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface MfaRequiredLoginResponseBody {
  kind?: string;
  success?: boolean;
  message?: string;
  challenge_id?: string;
  expires_at?: number;
  available_factors?: Array<{
    factor_id: string;
    factor_type: string;
    last_used_at: number | null;
  }>;
  recovery_codes_available?: boolean;
  authorization_code?: string;
}

interface MfaVerifyResponseBody {
  kind?: string;
  success?: boolean;
  message?: string;
  authorization_code?: string;
}

interface MfaStatusResponseBody {
  recovery_codes_remaining: number;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const UNKNOWN_CHALLENGE_ID = "00000000-0000-0000-0000-000000000099";

function attemptLogin(
  email: string,
  password: string,
): Cypress.Chainable<Cypress.Response<MfaRequiredLoginResponseBody>> {
  cy.reset_rate_limit();
  const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
  return cy
    .wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
      PKCE_ProofKeyManager.createCodeChallenge(verifier),
      { log: false },
    )
    .then((challenge) =>
      cy.request<MfaRequiredLoginResponseBody>({
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

function verify(
  body: Cypress.RequestBody,
): Cypress.Chainable<Cypress.Response<MfaVerifyResponseBody>> {
  return cy.request<MfaVerifyResponseBody>({
    method: "POST",
    url: "/api/auth/mfa/verify",
    body,
    failOnStatusCode: false,
  });
}

/** Registers a user, seeds TOTP, and yields the credentials + MFA material. */
function setupMfaUser(): Cypress.Chainable<{
  email: string;
  password: string;
  uid: string;
  factor_id: string;
  secret: string;
  recovery_codes: readonly string[];
}> {
  return cy.generate_random_test_user_credentials().then((credentials) =>
    cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((ok: boolean) => {
        expect(ok, "registration").to.be.true;
        cy.logout();
        return cy.enroll_test_user_mfa({ email: credentials.email });
      })
      .then((mfa) => ({ ...credentials, ...mfa })),
  );
}

describe("MFA login challenge API", () => {
  it("login returns an mfa_required challenge without issuing a session, and the challenge is bound to the client app", () => {
    setupMfaUser().then(({ email, password, factor_id, secret }) => {
      attemptLogin(email, password).then((login) => {
        expect(login.status).to.eq(200);
        expect(login.body.kind).to.eq("mfa_required");
        expect(login.body.success).to.eq(true);
        expect(login.body.challenge_id).to.be.a("string");
        expect(login.body.expires_at).to.be.a("number").and.be.greaterThan(
          Date.now(),
        );
        expect(login.body.available_factors).to.deep.equal([
          { factor_id, factor_type: "totp", last_used_at: null },
        ]);
        expect(login.body.recovery_codes_available).to.eq(true);
        expect(login.body).to.not.have.property("authorization_code");
        cy.getCookie(RefreshTokenCookieName(AUTH_APP_ID)).should("not.exist");

        const challenge_id = login.body.challenge_id as string;
        cy.compute_totp_code(secret).then((code) => {
          verify({
            challenge_id,
            client_app_id: "some-other-app",
            proof: { type: "totp", factor_id, code },
          }).then((response) => {
            expect(response.status, "client_app_id mismatch").to.eq(400);
            expect(response.body.kind).to.eq("failure");
          });
          verify({
            challenge_id: UNKNOWN_CHALLENGE_ID,
            client_app_id: AUTH_APP_ID,
            proof: { type: "totp", factor_id, code },
          }).then((response) => {
            expect(response.status, "unknown challenge").to.eq(410);
            expect(response.body.kind).to.eq("challenge_expired");
          });
        });
        verify({ challenge_id }).then((response) => {
          expect(response.status, "missing proof").to.eq(400);
        });
        cy.request({
          method: "POST",
          url: "/api/auth/mfa/verify",
          headers: { "content-type": "application/json" },
          body: "{not json",
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "non-JSON body").to.eq(400);
        });

        // The mismatch / unknown-challenge probes must not have consumed
        // an attempt: a valid TOTP still completes the challenge.
        cy.compute_totp_code(secret).then((code) => {
          verify({
            challenge_id,
            client_app_id: AUTH_APP_ID,
            proof: { type: "totp", factor_id, code },
          }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.kind).to.eq("authenticated");
            expect(response.body.authorization_code).to.be.a("string");
            cy.getCookie(RefreshTokenCookieName(AUTH_APP_ID)).should("exist");
          });
          // A completed challenge cannot be replayed.
          verify({
            challenge_id,
            client_app_id: AUTH_APP_ID,
            proof: { type: "totp", factor_id, code },
          }).then((response) => {
            expect(response.status, "replay after success").to.eq(410);
            expect(response.body.kind).to.eq("challenge_expired");
          });
        });
      });
    });
  });

  it("recovery codes are single-use and decrement the remaining count", () => {
    setupMfaUser().then(({ email, password, recovery_codes }) => {
      const recovery_code = recovery_codes[0] as string;
      attemptLogin(email, password).then((login) => {
        const challenge_id = login.body.challenge_id as string;
        verify({
          challenge_id,
          client_app_id: AUTH_APP_ID,
          proof: { type: "recovery_code", recovery_code },
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.kind).to.eq("authenticated");
        });
        cy.request<MfaStatusResponseBody>({
          method: "GET",
          url: "/api/user/mfa/status",
        }).then((response) => {
          expect(response.body.recovery_codes_remaining).to.eq(
            recovery_codes.length - 1,
          );
        });
      });

      cy.logout();
      attemptLogin(email, password).then((login) => {
        const challenge_id = login.body.challenge_id as string;
        verify({
          challenge_id,
          client_app_id: AUTH_APP_ID,
          proof: { type: "recovery_code", recovery_code },
        }).then((response) => {
          expect(response.status, "reused recovery code").to.eq(401);
          expect(response.body.kind).to.eq("failure");
          expect(String(response.body.message)).to.include("attempt");
        });
      });
    });
  });

  it("POST /api/auth/mfa/webauthn/options refuses TOTP-only users, unknown challenges and mismatched client apps", () => {
    setupMfaUser().then(({ email, password }) => {
      attemptLogin(email, password).then((login) => {
        const challenge_id = login.body.challenge_id as string;
        cy.request({
          method: "POST",
          url: "/api/auth/mfa/webauthn/options",
          body: { challenge_id, client_app_id: AUTH_APP_ID },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "no passkeys enrolled").to.eq(409);
          expect(response.body).to.have.property("success", false);
        });
        cy.request({
          method: "POST",
          url: "/api/auth/mfa/webauthn/options",
          body: { challenge_id: UNKNOWN_CHALLENGE_ID, client_app_id: AUTH_APP_ID },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "unknown challenge").to.eq(410);
        });
        cy.request({
          method: "POST",
          url: "/api/auth/mfa/webauthn/options",
          body: { challenge_id, client_app_id: "some-other-app" },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "client_app_id mismatch").to.eq(400);
        });
        cy.request({
          method: "POST",
          url: "/api/auth/mfa/webauthn/options",
          body: { challenge_id: "not-a-uuid" },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "malformed body").to.eq(400);
        });
      });
    });
  });
});
