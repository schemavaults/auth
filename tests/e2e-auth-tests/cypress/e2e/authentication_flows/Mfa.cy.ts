import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import { RefreshTokenCookieName } from "@schemavaults/auth-common";

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
          RefreshTokenCookieName(SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id),
        ).should("exist");
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
              RefreshTokenCookieName(SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id),
            ).should("exist");
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

  it("five wrong codes leave the user on /auth/mfa with a 'log in again' error", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((ok) => {
        if (!ok) throw new Error("Failed to register/login regular user");
        cy.logout();
        cy.enroll_test_user_mfa({ email: credentials.email }).then(() => {
          cy.reset_rate_limit();
          submitLoginForm(credentials.email, credentials.password);
          waitForMfaChallengeForm();

          for (let i = 0; i < 5; i += 1) {
            cy.get("[data-testid='mfa-challenge-input']")
              .should("be.visible")
              .should("not.be.disabled")
              .clear()
              .type("000000");
            cy.get("[data-testid='mfa-challenge-submit']")
              .should("not.be.disabled")
              .click();
            // Wait for the form to settle (submitting=false) before the
            // next iteration, so .clear()/.type() never race with the
            // disabled-while-submitting state.
            cy.get("[data-testid='mfa-challenge-submit']", { timeout: 10_000 })
              .should("not.be.disabled");
          }
          cy.url().should("include", "/auth/mfa");
          cy.contains(/log in again|too many|attempts/i).should("be.visible");
        });
      });
    });
  });
});
