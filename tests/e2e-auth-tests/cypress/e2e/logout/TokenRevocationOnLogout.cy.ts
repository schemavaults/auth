import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  RefreshTokenCookieName,
} from "@schemavaults/auth-common";

const APP_ID = getAuthServerAppIdFromCypressEnv();
const REFRESH_TOKEN_COOKIE = RefreshTokenCookieName(APP_ID);

describe("Token Revocation on Logout", () => {
  it("rejects a refresh token that was used before logout (revoked)", () => {
    cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }

      // The request-based login does not navigate the browser; land on the
      // account page before driving the logout UI.
      cy.visit("/account");
      cy.url().should("include", "/account");

      // Capture the refresh token cookie value before logout
      cy.getCookie(REFRESH_TOKEN_COOKIE).should("exist").then((cookie) => {
        if (!cookie || !cookie.value) {
          throw new Error("Refresh token cookie not found");
        }
        const capturedRefreshToken: string = cookie.value;

        // Perform logout -- this should revoke the token server-side
        cy.logout().then(() => {
          // Verify cookies are cleared
          cy.getCookie(REFRESH_TOKEN_COOKIE).should("not.exist");

          // Attempt to use the captured (now revoked) refresh token
          cy.request({
            method: "POST",
            url: `/api/auth/token/refresh_token/${APP_ID}`,
            body: {
              grant_type: "refresh_token",
              // token audiences use the auth server URL, not the app id
              audience: Cypress.env("AUTH_SERVER_URL"),
              client_app_id: APP_ID,
            },
            headers: {
              Authorization: `Bearer ${capturedRefreshToken}`,
              "Content-Type": "application/json",
              Origin: new URL(Cypress.config("baseUrl")!).origin,
            },
            failOnStatusCode: false,
          }).then((response) => {
            // The refresh attempt should be rejected because the token was revoked
            expect(response.status).to.eq(401);
            expect(response.body.success).to.eq(false);
            expect(response.body.message).to.include("revoked");
          });
        });
      });
    });
  });
});
