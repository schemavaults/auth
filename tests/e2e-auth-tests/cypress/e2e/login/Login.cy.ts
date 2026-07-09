import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

describe("Login", () => {
  it("can load the login page", () => {
    cy.visit("/auth/login");
  });

  it("can submit an invalid login form and not be redirected", () => {
    cy.visit("/auth/login");
    cy.get("input[name='email']").type("testinvalidcredentials@example.com", {
      force: true,
    });
    cy.get("input[name='password']").type("passWord123!@#"); // random credentials
    cy.get("button[type='submit']").click();
    cy.url().should("include", "/auth/login");
  });

  it("can login as superuser and is redirected from /auth/login to /account after authentication", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.getCookie(
        RefreshTokenCookieName(AUTH_APP_ID),
      ).should("exist");
      cy.getCookie(
        RefreshTokenExpiryCookieName(AUTH_APP_ID),
      ).should("exist");

      cy.visit("/auth/login");
      cy.url().should("not.include", "/auth/login");
      cy.url().should("include", "/account");
    });
  });

  it("can create and login as a regular user", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then(
        (result: boolean) => {
          if (!result) {
            throw new Error("Failed to create and login as regular user!");
          }
          cy.log(`Logged in as regular user: ${credentials.email}`);

          cy.getCookie(
            RefreshTokenCookieName(AUTH_APP_ID),
          ).should("exist");
          cy.getCookie(
            RefreshTokenExpiryCookieName(
              AUTH_APP_ID,
            ),
          ).should("exist");
          cy.url().should("include", "/account");

          // Regular user should not be an admin
          cy.is_admin().should("be.false");

          // Verify user can logout and login again with same credentials
          cy.logout();

          cy.login(credentials.email, credentials.password).then(
            (login_success: boolean) => {
              expect(login_success, "Re-login with same credentials should succeed").to.be.true;
              cy.url().should("include", "/account");
            },
          );
        },
      );
    });
  });
});
