// Every /api/user/mfa/* factor lookup is scoped to the caller's uid
// (getFactorWithSecretById / getVerifiedFactorById both take `uid`). The
// existing MFA specs only ever present the caller's own factor id, or a
// factor id that belongs to nobody (UNKNOWN_FACTOR_ID in
// MfaTotpApiLifecycle.cy.ts), so dropping that uid scoping would keep every
// one of them green while letting any signed-in user destroy or step up with
// another account's authenticator factor. These two tests present a *real*
// other user's factor id together with a currently valid code from it.

import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";
import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface MfaStatusResponseBody {
  enabled: boolean;
  factors: Array<{ factor_id: string; factor_type: string; verified_at: number }>;
  recovery_codes_remaining: number;
}

interface MfaErrorResponseBody {
  success?: boolean;
  message?: string;
  recovery_codes?: string[];
}

interface LoginResponseBody {
  kind?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

interface MfaUser {
  email: string;
  password: string;
  factor_id: string;
  secret: string;
}

/**
 * Registers a user (signing them in), then seeds a verified TOTP factor with
 * a known secret through the test-only enrollment endpoint. The caller is
 * left signed in as that user.
 */
function createSignedInMfaUser(): Cypress.Chainable<MfaUser> {
  return cy.generate_random_test_user_credentials().then((credentials) =>
    cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((ok: boolean) => {
        expect(ok, "regular user registration + login").to.be.true;
        return cy.enroll_test_user_mfa({ email: credentials.email });
      })
      .then((mfa) => ({
        email: credentials.email,
        password: credentials.password,
        factor_id: mfa.factor_id,
        secret: mfa.secret,
      })),
  );
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

/**
 * Sets up a victim with a seeded TOTP factor, then an attacker — a second
 * regular user with a TOTP factor of their own, so the endpoints cannot pass
 * these tests merely by refusing callers without MFA. Ends signed in as the
 * attacker and yields both users' factor material.
 */
function setupVictimAndAttacker(): Cypress.Chainable<{
  victim: MfaUser;
  attacker: MfaUser;
}> {
  return createSignedInMfaUser().then((victim) =>
    // create_and_login_as_regular_user_via_request signs the victim out
    // first, so the attacker's session cookie replaces the victim's.
    createSignedInMfaUser().then((attacker) => ({ victim, attacker })),
  );
}

describe("MFA factor cross-user isolation", () => {
  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("refuses to remove another user's TOTP factor given a currently valid code from it", () => {
    setupVictimAndAttacker().then(({ victim, attacker }) => {
      cy.compute_totp_code(victim.secret).then((victim_code: string) => {
        cy.request<MfaErrorResponseBody>({
          method: "DELETE",
          url: `/api/user/mfa/totp/${victim.factor_id}`,
          body: { code: victim_code },
          failOnStatusCode: false,
        }).then((response) => {
          expect(
            response.status,
            "DELETE another user's TOTP factor",
          ).to.eq(404);
          expect(response.body.success).to.eq(false);
        });
      });

      // The attacker's own factor is untouched and the victim's factor id did
      // not leak into the attacker's account.
      cy.request<MfaStatusResponseBody>({
        method: "GET",
        url: "/api/user/mfa/status",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.enabled, "attacker still enrolled").to.eq(true);
        expect(
          response.body.factors.map((factor) => factor.factor_id),
          "attacker's own factors only",
        ).to.deep.equal([attacker.factor_id]);
      });

      // The victim's factor survived: their login still demands a second
      // factor instead of signing them straight in.
      cy.logout();
      attemptLogin(victim.email, victim.password).then((login) => {
        expect(login.status).to.eq(200);
        expect(login.body.kind, "victim's login after the attempt").to.eq(
          "mfa_required",
        );
      });
    });
  });

  it("refuses another user's TOTP factor as step-up proof when regenerating recovery codes", () => {
    setupVictimAndAttacker().then(({ victim }) => {
      cy.request<MfaStatusResponseBody>({
        method: "GET",
        url: "/api/user/mfa/status",
      }).then((before) => {
        const codes_before = before.body.recovery_codes_remaining;
        expect(codes_before, "attacker's seeded recovery codes").to.be.greaterThan(0);

        cy.compute_totp_code(victim.secret).then((victim_code: string) => {
          cy.request<MfaErrorResponseBody>({
            method: "POST",
            url: "/api/user/mfa/recovery-codes/regenerate",
            body: { factor_id: victim.factor_id, code: victim_code },
            failOnStatusCode: false,
          }).then((response) => {
            expect(
              response.status,
              "regenerate with another user's factor",
            ).to.eq(400);
            expect(response.body.success).to.eq(false);
            expect(
              response.body,
              "no recovery codes handed out",
            ).to.not.have.property("recovery_codes");
          });
        });

        cy.request<MfaStatusResponseBody>({
          method: "GET",
          url: "/api/user/mfa/status",
        }).then((after) => {
          expect(
            after.body.recovery_codes_remaining,
            "attacker's recovery codes untouched",
          ).to.eq(codes_before);
        });
      });
    });
  });
});
