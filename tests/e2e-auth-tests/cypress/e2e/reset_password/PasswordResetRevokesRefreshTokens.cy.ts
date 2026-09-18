import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import { RefreshTokenCookieName } from "@schemavaults/auth-common";

const APP_ID = getAuthServerAppIdFromCypressEnv();
const REFRESH_TOKEN_COOKIE = RefreshTokenCookieName(APP_ID);

// Redeems a *captured* refresh token at the OIDC token endpoint (RFC 6749
// §6, form-encoded). The explicit `refresh_token` parameter takes
// precedence over the session cookie, so each request redeems exactly the
// token it presents.
function redeemRefreshToken(capturedRefreshToken: string) {
  return cy.request({
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
  });
}

describe("Password Reset Revokes Refresh Tokens", () => {
  it("rejects captured refresh tokens after rotation and after a password reset", () => {
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
            const originalRefreshToken: string = cookie.value;

            // Sanity check: the session's refresh token works before the
            // reset. This redemption rotates the refresh token — the
            // response sets a fresh cookie and revokes the presented
            // (original) token as used.
            redeemRefreshToken(originalRefreshToken).then(
              (preResetResponse) => {
                expect(
                  preResetResponse.status,
                  "Refresh token should work before password reset",
                ).to.eq(200);
              },
            );

            // The live session token is now the rotated cookie set by the
            // redemption above; this is the token the "attacker" holds
            // going into the password reset.
            cy.getCookie(REFRESH_TOKEN_COOKIE)
              .should("exist")
              .then((rotatedCookie) => {
                if (!rotatedCookie || !rotatedCookie.value) {
                  throw new Error(
                    "Rotated refresh token cookie not found after redemption",
                  );
                }
                const rotatedRefreshToken: string = rotatedCookie.value;
                expect(
                  rotatedRefreshToken,
                  "Redemption should rotate the refresh token cookie",
                ).to.not.eq(originalRefreshToken);

                // End the legitimate session locally WITHOUT logging out:
                // logout would revoke the rotated token server-side, and
                // this spec must prove the *password reset* revokes it.
                //
                // (Replay of the used original token is NOT asserted here:
                // within the rotation reuse grace window it would still
                // succeed — the refresh_token_rotation suite covers replay
                // semantics with proper timing.)
                cy.clearCookies();

                // The tokens_valid_after watermark has one-second
                // granularity and uses strict less-than (see
                // is-token-iat-revoked.ts): a token minted in the same
                // unix second as the watermark bump stays valid — by
                // design. Wait out the second boundary so the rotated
                // token's iat lands strictly before the watermark set by
                // the reset confirm below; without this the final 400
                // assertion is a wall-clock coin toss. The wait MUST come
                // before the confirm — once iat equals the watermark the
                // token is valid forever, so delaying the final request
                // instead would not help.
                cy.wait(2000);

                // Request a password reset token through the test-only
                // endpoint.
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

                    // Attempt to mint new tokens with the captured rotated
                    // token — never redeemed and never revoked by logout,
                    // so only the password reset (tokens_valid_after
                    // watermark) can be what rejects it.
                    redeemRefreshToken(rotatedRefreshToken).then(
                      (postResetResponse) => {
                        expect(postResetResponse.status).to.eq(400);
                        expect(postResetResponse.body.error).to.eq(
                          "invalid_grant",
                        );
                        expect(
                          postResetResponse.body.error_description,
                        ).to.include("revoked");
                        expect(postResetResponse.body).to.not.have.property(
                          "access_token",
                        );
                      },
                    );
                  });
                });
              });
          });
      });
    });
  });
});
