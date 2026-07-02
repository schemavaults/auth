import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";
import { RefreshTokenCookieName } from "@schemavaults/auth-common";

const APP_ID = SCHEMAVAULTS_AUTH_APP_ID;
const REFRESH_TOKEN_COOKIE = RefreshTokenCookieName(APP_ID);

describe("Password Reset Revokes Refresh Tokens", () => {
  it("rejects a captured refresh token after the user resets their password", () => {
    const newPassword = "RotatedAfterReset123!@#";

    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(
          success,
          "create_and_login_as_regular_user should succeed",
        ).to.be.true;

        // Capture the refresh token before any reset happens — this
        // simulates an attacker who has already exfiltrated the token.
        cy.getCookie(REFRESH_TOKEN_COOKIE)
          .should("exist")
          .then((cookie) => {
            if (!cookie || !cookie.value) {
              throw new Error("Refresh token cookie not found");
            }
            const capturedRefreshToken: string = cookie.value;

            // Sanity check: the captured token works before the reset.
            cy.request({
              method: "POST",
              url: `/api/auth/token/refresh_token/${APP_ID}`,
              body: {
                grant_type: "refresh_token",
                audience: APP_ID,
                client_app_id: APP_ID,
              },
              headers: {
                Authorization: `Bearer ${capturedRefreshToken}`,
                "Content-Type": "application/json",
                Origin: new URL(Cypress.config("baseUrl")!).origin,
              },
              failOnStatusCode: false,
            }).then((preResetResponse) => {
              expect(
                preResetResponse.status,
                "Captured refresh token should work before password reset",
              ).to.eq(200);
            });

            // Logout to clear the legitimate session's cookies (the
            // attacker still holds capturedRefreshToken).
            cy.logout();

            // Request a password reset token through the test-only endpoint.
            cy.request({
              method: "GET",
              url: `/api/test/password-reset-token/${encodeURIComponent(credentials.email)}`,
              failOnStatusCode: false,
            }).then((tokenResponse) => {
              expect(tokenResponse.status).to.equal(200);
              expect(tokenResponse.body.token).to.be.a("string");
              const resetToken: string = tokenResponse.body.token;

              // Confirm the password reset.
              cy.request({
                method: "POST",
                url: "/api/auth/reset-password/confirm",
                body: { token: resetToken, new_password: newPassword },
                failOnStatusCode: false,
              }).then((confirmResponse) => {
                expect(confirmResponse.status).to.equal(200);

                // Attempt to mint new tokens with the captured refresh
                // token — this MUST now be rejected.
                cy.request({
                  method: "POST",
                  url: `/api/auth/token/refresh_token/${APP_ID}`,
                  body: {
                    grant_type: "refresh_token",
                    audience: APP_ID,
                    client_app_id: APP_ID,
                  },
                  headers: {
                    Authorization: `Bearer ${capturedRefreshToken}`,
                    "Content-Type": "application/json",
                    Origin: new URL(Cypress.config("baseUrl")!).origin,
                  },
                  failOnStatusCode: false,
                }).then((postResetResponse) => {
                  expect(postResetResponse.status).to.eq(401);
                  expect(postResetResponse.body.success).to.eq(false);
                  expect(postResetResponse.body.message).to.include("revoked");
                });
              });
            });
          });
      });
    });
  });
});
