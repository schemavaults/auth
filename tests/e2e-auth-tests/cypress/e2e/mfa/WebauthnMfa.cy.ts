import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import { RefreshTokenCookieName } from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

// Navigate to /auth/login, type credentials, submit. Mirrors the helper in
// Mfa.cy.ts (with the same hydration/visibility guards).
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

  cy.get("button[type='submit']")
    .should("exist")
    .should("not.be.disabled")
    .click();
}

// Drive the /mfa-page passkey enrollment UI through a successful
// registration ceremony (the CDP virtual authenticator auto-responds).
function enrollPasskeyViaUi(): void {
  cy.get("[data-testid='passkey-add-button']")
    .should("be.visible")
    .should("not.be.disabled")
    .click();
  cy.get("[data-testid='passkey-enroll-create']")
    .should("be.visible")
    .should("not.be.disabled")
    .click();
}

// NOTE: WebAuthn virtual authenticators require a Chromium-family browser
// driven over the Chrome DevTools Protocol's `WebAuthn` domain. Electron —
// the default `cypress run` browser used in CI — does NOT implement that CDP
// domain, so `cy.add_virtual_authenticator()` cannot work there. Run this
// spec with `--browser chrome`; under Electron it is skipped (rather than
// failing the whole MFA suite) so CI stays green while the coverage remains
// available locally and in any Chrome-based run.
const describeWebauthn =
  Cypress.browser.name === "electron" ? describe.skip : describe;

describeWebauthn("WebAuthn passkey MFA", () => {
  let authenticatorId: string | null = null;

  beforeEach(() => {
    cy.reset_rate_limit();
    cy.add_virtual_authenticator().then((id) => {
      authenticatorId = id;
    });
  });

  afterEach(() => {
    if (authenticatorId) {
      cy.remove_virtual_authenticator(authenticatorId);
      authenticatorId = null;
    }
  });

  it("enrolls a passkey (first factor) and then logs in with it", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((ok) => {
        if (!ok) throw new Error("Failed to register/login regular user");
        cy.url().should("include", "/account");

        // MFA settings now live on the dedicated /mfa route.
        cy.visit("/mfa");
        cy.wait_for_page_hydration();

        enrollPasskeyViaUi();

        // First verified factor → recovery codes are issued. Acknowledge
        // them, then finish.
        cy.get("[data-testid='mfa-recovery-codes-acknowledge']", {
          timeout: 15_000,
        })
          .should("be.visible")
          .click();
        cy.get("[data-testid='passkey-enroll-done']")
          .should("not.be.disabled")
          .click();

        // The new passkey shows up in the management list.
        cy.get("[data-testid='passkey-list']").should("exist");

        // Log out, then log back in — the passkey now gates sign-in.
        cy.logout();
        cy.reset_rate_limit();
        submitLoginForm(credentials.email, credentials.password);

        cy.url({ timeout: 15_000 }).should("include", "/auth/mfa");
        cy.wait_for_page_hydration();
        cy.get("[data-testid='mfa-challenge-passkey-button']", {
          timeout: 10_000,
        })
          .should("be.visible")
          .should("not.be.disabled")
          .click();

        cy.url({ timeout: 15_000 }).should("include", "/account");
        cy.getCookie(
          RefreshTokenCookieName(AUTH_APP_ID),
        ).should("exist");
        cy.wait_for_page_hydration();
        cy.is_authenticated().should("be.true");
      });
    });
  });

  it("enrolling a passkey alongside existing TOTP does not reissue recovery codes", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((ok) => {
        if (!ok) throw new Error("Failed to register/login regular user");

        // Seed a TOTP factor (and recovery codes) directly, then go to the
        // /mfa page where MFA status will reflect the new factor.
        cy.enroll_test_user_mfa({ email: credentials.email }).then(() => {
          cy.visit("/mfa");
          cy.wait_for_page_hydration();

          enrollPasskeyViaUi();

          // Because the user already has recovery codes (from TOTP), the
          // passkey enrollment must NOT regenerate them — the dialog shows
          // the "existing recovery codes still apply" note instead of a
          // recovery-codes panel, and Done is immediately enabled.
          cy.get("[data-testid='passkey-enroll-existing-recovery-note']", {
            timeout: 15_000,
          }).should("be.visible");
          cy.get("[data-testid='mfa-recovery-codes-list']").should("not.exist");
          cy.get("[data-testid='passkey-enroll-done']")
            .should("not.be.disabled")
            .click();

          cy.get("[data-testid='passkey-list']").should("exist");
        });
      });
    });
  });

  it("still allows logging in with TOTP when both factors exist", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((ok) => {
        if (!ok) throw new Error("Failed to register/login regular user");

        cy.enroll_test_user_mfa({ email: credentials.email }).then((mfa) => {
          cy.visit("/mfa");
          cy.wait_for_page_hydration();

          enrollPasskeyViaUi();
          cy.get("[data-testid='passkey-enroll-existing-recovery-note']", {
            timeout: 15_000,
          }).should("be.visible");
          cy.get("[data-testid='passkey-enroll-done']")
            .should("not.be.disabled")
            .click();

          // Log out and complete the login with TOTP. With two factor types
          // available the picker is shown; select the authenticator app.
          cy.logout();
          cy.reset_rate_limit();
          submitLoginForm(credentials.email, credentials.password);
          cy.url({ timeout: 15_000 }).should("include", "/auth/mfa");
          cy.wait_for_page_hydration();

          // Choose the TOTP factor in the picker, then submit a code.
          cy.contains("Authenticator app", { timeout: 10_000 })
            .should("be.visible")
            .click();
          cy.compute_totp_code(mfa.secret).then((code) => {
            cy.get("[data-testid='mfa-challenge-input']")
              .should("be.visible")
              .clear()
              .type(code);
            cy.get("[data-testid='mfa-challenge-submit']")
              .should("not.be.disabled")
              .click();
            cy.url({ timeout: 15_000 }).should("include", "/account");
            cy.is_authenticated().should("be.true");
          });
        });
      });
    });
  });
});
