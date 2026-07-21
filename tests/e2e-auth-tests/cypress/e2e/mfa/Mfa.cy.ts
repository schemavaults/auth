import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import { RefreshTokenCookieName } from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

// Reusable: navigate to /auth/login, type the credentials, and submit.
// Adds the same hydration + visibility guards used by the existing
// cy.login() helper so React's hydration-driven re-renders don't yank
// the input out from under .type().
function submitLoginForm(email: string, password: string): void {
  cy.visit("/auth/login");
  cy.wait_for_page_hydration();
  cy.url({ log: false }).should("include", "/auth/login");

  cy.get("input[name='email']")
    .should("exist")
    .should("be.visible")
    .should("not.be.disabled")
    .type(email, { force: true });
  cy.get("input[name='password']")
    .should("exist")
    .should("be.visible")
    .should("not.be.disabled")
    .type(password, { force: true });
  cy.get("input[name='email']").should("have.value", email);
  cy.get("input[name='password']").should("have.value", password);

  cy.get("button[type='submit']")
    .should("exist")
    .should("not.be.disabled")
    .click();
}

function waitForMfaChallengeForm(): void {
  cy.url({ timeout: 15_000 }).should("include", "/auth/mfa");
  cy.wait_for_page_hydration();
  cy.get("[data-testid='mfa-challenge-input']", { timeout: 10_000 })
    .should("exist")
    .should("be.visible")
    .should("not.be.disabled");
}

describe("MFA (TOTP + recovery codes)", () => {
  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("a user without MFA logs in normally (additive guarantee)", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((ok) => {
        if (!ok) throw new Error("Failed to register/login regular user");
        cy.url().should("include", "/account");
        cy.getCookie(
          RefreshTokenCookieName(AUTH_APP_ID),
        ).should("exist");
      });
    });
  });

  // Drives the real /mfa settings UI through the full TOTP enrollment flow
  // (enroll → verify-enrollment → recovery codes issued), unlike the other
  // tests in this suite which seed the factor via the test-only endpoint.
  // Regression test: POST /api/user/mfa/totp/verify-enrollment returned 500
  // ("calling the transaction method for a Transaction is not supported")
  // when issuing the first verified factor's recovery codes, because
  // replaceRecoveryCodes opened a nested transaction inside
  // issueRecoveryCodesIfNeeded's advisory-lock transaction.
  it("enrolls TOTP via the /mfa settings UI, issuing recovery codes for the first factor", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((ok) => {
        if (!ok) throw new Error("Failed to register/login regular user");
        cy.url().should("include", "/account");

        cy.visit("/mfa");
        cy.wait_for_page_hydration();

        cy.intercept("POST", "/api/user/mfa/totp/verify-enrollment").as(
          "verifyEnrollment",
        );

        cy.contains("button", "Set up authenticator app")
          .should("be.visible")
          .should("not.be.disabled")
          .click();

        cy.get("[data-testid='mfa-enroll-qr']", { timeout: 15_000 }).should(
          "be.visible",
        );

        // Read the base32 secret from the dialog's "Can't scan? Show
        // secret" details rather than intercepting the enroll response:
        // the dialog's retained enrollment is what the verify call is
        // bound to (and in dev, React StrictMode can double-fire the
        // enroll effect, making an intercepted response the wrong factor).
        cy.contains("summary", "Can't scan? Show secret").click();
        cy.get("details code")
          .invoke("text")
          .then((secretText) => {
            const secret = secretText.trim();
            expect(secret, "TOTP secret shown in dialog").to.have.length.above(
              0,
            );
            cy.compute_totp_code(secret).then((code) => {
              cy.get("[data-testid='mfa-enroll-code-input']")
                .should("be.visible")
                .should("not.be.disabled")
                .clear()
                .type(code);
              cy.get("[data-testid='mfa-enroll-confirm']")
                .should("not.be.disabled")
                .click();
            });
          });

        // The endpoint that 500'd pre-fix must succeed...
        cy.wait("@verifyEnrollment")
          .its("response.statusCode")
          .should("eq", 200);

        // ...and the first verified factor mints fresh recovery codes,
        // which the dialog renders and requires acknowledging.
        cy.get("[data-testid='mfa-recovery-codes-list']", {
          timeout: 15_000,
        }).should("be.visible");
        cy.get("[data-testid='mfa-recovery-codes-acknowledge']")
          .should("be.visible")
          .click();
        // force: the "Multi-factor authentication enabled" success toast
        // overlaps the dialog footer in the CI viewport, and Cypress
        // refuses to click a covered element. The outcome is still
        // asserted below via the settings card state.
        cy.get("[data-testid='mfa-enroll-done']")
          .should("not.be.disabled")
          .click({ force: true });

        // The settings card reflects the newly-verified factor.
        cy.contains("Enabled (TOTP)", { timeout: 10_000 }).should(
          "be.visible",
        );
      });
    });
  });

  it("MFA-enrolled user is redirected to /auth/mfa on login and a valid TOTP completes the flow", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((ok) => {
        if (!ok) throw new Error("Failed to register/login regular user");
        cy.logout();
        cy.enroll_test_user_mfa({ email: credentials.email }).then((mfa) => {
          cy.reset_rate_limit();
          submitLoginForm(credentials.email, credentials.password);
          waitForMfaChallengeForm();

          cy.compute_totp_code(mfa.secret).then((code) => {
            cy.get("[data-testid='mfa-challenge-input']")
              .should("be.visible")
              .clear()
              .type(code);
            cy.get("[data-testid='mfa-challenge-submit']")
              .should("not.be.disabled")
              .click();
            cy.url({ timeout: 15_000 }).should("include", "/account");
            cy.getCookie(
              RefreshTokenCookieName(AUTH_APP_ID),
            ).should("exist");

            // Guard against a regression of the bug this fix addresses:
            // pre-fix, /account loaded with the SDK in-memory state empty
            // (AccountCard email/uid stuck on skeletons, useAdmin → false).
            // We assert the user's email is rendered as text and the
            // server agrees the session is live.
            cy.wait_for_page_hydration();
            cy.contains(credentials.email, { timeout: 10_000 }).should(
              "be.visible",
            );
            cy.is_authenticated().should("be.true");
          });
        });
      });
    });
  });

  it("MFA-enrolled user can log in with a recovery code (single-use)", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((ok) => {
        if (!ok) throw new Error("Failed to register/login regular user");
        cy.logout();
        cy.enroll_test_user_mfa({ email: credentials.email }).then((mfa) => {
          cy.reset_rate_limit();
          submitLoginForm(credentials.email, credentials.password);
          waitForMfaChallengeForm();

          cy.get("[data-testid='mfa-challenge-toggle-recovery']")
            .should("exist")
            .should("be.visible")
            .click();
          cy.get("[data-testid='mfa-challenge-input']")
            .should("be.visible")
            .clear()
            .type(mfa.recovery_codes[0]!);
          cy.get("[data-testid='mfa-challenge-submit']")
            .should("not.be.disabled")
            .click();
          cy.url({ timeout: 15_000 }).should("include", "/account");
        });
      });
    });
  });

  it("three wrong codes invalidate the challenge and redirect back to /auth/login", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((ok) => {
        if (!ok) throw new Error("Failed to register/login regular user");
        cy.logout();
        cy.enroll_test_user_mfa({ email: credentials.email }).then(() => {
          cy.reset_rate_limit();
          submitLoginForm(credentials.email, credentials.password);
          waitForMfaChallengeForm();

          // First two wrong codes — challenge stays alive, user stays on
          // /auth/mfa with an error message rendered.
          for (let i = 0; i < 2; i += 1) {
            cy.get("[data-testid='mfa-challenge-input']")
              .should("be.visible")
              .should("not.be.disabled")
              .clear()
              .type("000000");
            cy.get("[data-testid='mfa-challenge-submit']")
              .should("not.be.disabled")
              .click();
            // Wait for submitting=false before the next iteration so
            // .clear()/.type() never race with the disabled state.
            cy.get("[data-testid='mfa-challenge-submit']", { timeout: 10_000 })
              .should("not.be.disabled");
            cy.url().should("include", "/auth/mfa");
          }

          // Third wrong code — server returns 410 challenge_expired,
          // the form fires onChallengeExpired which navigates back to
          // /auth/login.
          cy.get("[data-testid='mfa-challenge-input']")
            .should("be.visible")
            .clear()
            .type("000000");
          cy.get("[data-testid='mfa-challenge-submit']")
            .should("not.be.disabled")
            .click();
          cy.url({ timeout: 15_000 }).should("include", "/auth/login");
        });
      });
    });
  });
});
