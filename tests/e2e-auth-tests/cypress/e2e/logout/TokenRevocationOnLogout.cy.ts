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

          // Attempt to use the captured (now revoked) refresh token at the
          // OIDC token endpoint (RFC 6749 §6, form-encoded).
          cy.request({
            method: "POST",
            url: "/api/oidc/token",
            form: true,
            body: {
              grant_type: "refresh_token",
              client_id: APP_ID,
              refresh_token: capturedRefreshToken,
            },
            headers: {
              Origin: new URL(Cypress.config("baseUrl")!).origin,
            },
            failOnStatusCode: false,
          }).then((response) => {
            // The refresh attempt should be rejected because the token was
            // revoked (RFC 6749 §5.2 invalid_grant).
            expect(response.status).to.eq(400);
            expect(response.body.error).to.eq("invalid_grant");
            expect(response.body.error_description).to.include("revoked");
            expect(response.body).to.not.have.property("access_token");
          });
        });
      });
    });
  });
});
