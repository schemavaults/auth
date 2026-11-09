import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();
const SIDEBAR_LOGOUT_LINK = '[data-testid="dashboard-sidebar-logout-link"]';

describe("Dashboard sidebar logout button", () => {
  it("logs the user out from the footer of the dashboard sidebar", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (success: boolean) => {
          if (!success) {
            throw new Error("Failed to create and login as a regular user");
          }

          // Any dashboard page has the sidebar; use one other than /account,
          // whose account card has a sign-out button of its own.
          cy.visit("/orgs");
          cy.url().should("include", "/orgs");
          cy.wait_for_page_hydration();
          cy.getCookie(RefreshTokenCookieName(AUTH_APP_ID)).should("exist");

          cy.intercept({
            method: "POST",
            url: `**/api/auth/logout/${AUTH_APP_ID}`,
            times: 1,
          }).as("logoutRequest");

          // The sidebar starts collapsed on desktop: the row shows its icon,
          // and its label stays in the DOM as the link's accessible name.
          cy.get(SIDEBAR_LOGOUT_LINK)
            .should("be.visible")
            .and("have.attr", "href", "/auth/logout")
            .and("contain.text", "Log out")
            .click();

          cy.wait("@logoutRequest", { timeout: 15000 })
            .its("response.statusCode")
            .should("eq", 200);

          cy.getCookie(RefreshTokenCookieName(AUTH_APP_ID)).should(
            "not.exist",
          );
          cy.getCookie(RefreshTokenExpiryCookieName(AUTH_APP_ID)).should(
            "not.exist",
          );

          cy.url({ timeout: 20000 })
            .should("not.include", "/auth/logout")
            .and("not.include", "/orgs");
          cy.is_authenticated().should(
            "equal",
            false,
            "User should not be authenticated after logging out from the sidebar",
          );
        },
      );
    });
  });
});
