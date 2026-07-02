import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";
import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common";

describe("Logout", () => {
  it("is redirected from the logout page to the login page (or home page) when not logged in", () => {
    cy.visit("/auth/logout");
    cy.url().should((value: string): boolean => {
      if (value.includes("/auth/logout")) {
        return false;
      }

      function isHomepage() {
        return (
          value === process.env.CYPRESS_BASE_URL ||
          `${value === process.env.CYPRESS_BASE_URL}/`
        );
      }

      if (
        isHomepage() ||
        value.includes("/auth/login") ||
        value.includes("/welcome") ||
        value.includes("/about")
      ) {
        return true;
      }
      return false;
    });
  });

  it("can logout from the superuser account from the sign out button on account page", () => {
    cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }

      // The request-based login does not navigate the browser; land on the
      // account page so the sign-out button is available for the logout test.
      cy.visit("/account");
      cy.url().should("include", "/account");

      // We should now be logged in (as superuser) on the account page
      cy.getCookie(
        RefreshTokenCookieName(SCHEMAVAULTS_AUTH_APP_ID),
      ).should("exist");
      cy.getCookie(
        RefreshTokenExpiryCookieName(SCHEMAVAULTS_AUTH_APP_ID),
      ).should("exist");

      // Perform logout
      cy.logout().then(() => {
        cy.getCookie(
          RefreshTokenCookieName(SCHEMAVAULTS_AUTH_APP_ID),
        ).should("not.exist");
        cy.getCookie(
          RefreshTokenExpiryCookieName(SCHEMAVAULTS_AUTH_APP_ID),
        ).should("not.exist");
      });
    });
  });
});
