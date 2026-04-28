import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import { RefreshTokenCookieName } from "@schemavaults/auth-common";

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
        cy.enroll_test_user_mfa({ email: credentials.email }).then(
          (mfa) => {
            cy.reset_rate_limit();
            cy.visit("/auth/login");
            cy.get("input[name='email']").type(credentials.email, {
              force: true,
            });
            cy.get("input[name='password']").type(credentials.password);
            cy.get("button[type='submit']").click();
            cy.url().should("include", "/auth/mfa");

            cy.compute_totp_code(mfa.secret).then((code) => {
              cy.get("[data-testid='mfa-challenge-input']").type(code);
              cy.get("[data-testid='mfa-challenge-submit']").click();
              cy.url({ timeout: 10_000 }).should("include", "/account");
              cy.getCookie(
                RefreshTokenCookieName(
                  SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
                ),
              ).should("exist");
            });
          },
        );
      });
    });
  });

  it("MFA-enrolled user can log in with a recovery code (single-use)", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((ok) => {
        if (!ok) throw new Error("Failed to register/login regular user");
        cy.logout();
        cy.enroll_test_user_mfa({ email: credentials.email }).then(
          (mfa) => {
            cy.reset_rate_limit();
            cy.visit("/auth/login");
            cy.get("input[name='email']").type(credentials.email, {
              force: true,
            });
            cy.get("input[name='password']").type(credentials.password);
            cy.get("button[type='submit']").click();
            cy.url().should("include", "/auth/mfa");

            cy.get("[data-testid='mfa-challenge-toggle-recovery']").click();
            cy.get("[data-testid='mfa-challenge-input']").type(
              mfa.recovery_codes[0]!,
            );
            cy.get("[data-testid='mfa-challenge-submit']").click();
            cy.url({ timeout: 10_000 }).should("include", "/account");
          },
        );
      });
    });
  });

  it("five wrong codes invalidate the challenge and force a fresh login", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((ok) => {
        if (!ok) throw new Error("Failed to register/login regular user");
        cy.logout();
        cy.enroll_test_user_mfa({ email: credentials.email }).then(() => {
          cy.reset_rate_limit();
          cy.visit("/auth/login");
          cy.get("input[name='email']").type(credentials.email, {
            force: true,
          });
          cy.get("input[name='password']").type(credentials.password);
          cy.get("button[type='submit']").click();
          cy.url().should("include", "/auth/mfa");

          for (let i = 0; i < 5; i += 1) {
            cy.get("[data-testid='mfa-challenge-input']")
              .clear()
              .type("000000");
            cy.get("[data-testid='mfa-challenge-submit']").click();
            // Brief settle so React renders the next error message.
            cy.wait(150);
          }
          // After exhaustion the form surfaces an error and the
          // onChallengeExpired callback navigates back to /auth/login.
          cy.url({ timeout: 10_000 }).should("include", "/auth/login");
        });
      });
    });
  });
});
