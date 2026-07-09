import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common";
import getAuthServerAppIdFromCypressEnv from "../get-auth-server-app-id-from-cypress-env";

export default function logout() {
  const auth_app_id = getAuthServerAppIdFromCypressEnv();

  // Go to the account page
  cy.visit("/account");

  // Pre-logout assertions
  cy.is_authenticated().should(
    "be.true",
    "User should be authenticated before logout",
  );
  cy.url().should("include", "/account").should("not.include", "/auth/login");
  cy.getCookie(RefreshTokenCookieName(auth_app_id)).should(
    "exist",
  );

  // Perform logout actions
  cy.intercept({
    method: "POST",
    url: `**/api/auth/logout/${auth_app_id}`,
    times: 1,
  }).as("logoutRequest");
  cy.get("button#sign-out-button").click();

  // Post-logout triggered assertions
  cy.wait(2000).then(() => {
    cy.url().should("not.include", "/account");

    cy.wait("@logoutRequest", { timeout: 15000 }).then((interception) => {
      cy.wrap(interception.response?.statusCode).should(
        "eq",
        200,
        "Logout API request should return 200",
      );
      cy.log(
        "Logout request appears to have been a success-- ensuring that refresh token cookies were cleared.",
      );
      cy.wait(1000);

      // refresh token should have been cleared by logout request
      cy.getCookie(RefreshTokenCookieName(auth_app_id)).should(
        "not.exist",
      );
      cy.getCookie(
        RefreshTokenExpiryCookieName(auth_app_id),
      ).should("not.exist");
      cy.log(
        "Logout request appears to have successfully cleared refresh token cookies!",
      );

      cy.url({ timeout: 20000 }).should("not.include", "/auth/logout");
      cy.is_authenticated().should(
        "equal",
        false,
        "User should not be authenticated after logout",
      );
    });
    return;
  });
}
