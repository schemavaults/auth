import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import { RefreshTokenCookieName } from "@schemavaults/auth-common";

const APP_ID = getAuthServerAppIdFromCypressEnv();
const REFRESH_TOKEN_COOKIE = RefreshTokenCookieName(APP_ID);

// Must exceed REFRESH_TOKEN_ROTATION_REUSE_GRACE_MS (10s) on the server.
const ROTATION_REUSE_GRACE_MS = 10_000;
const WAIT_PAST_GRACE_MS = ROTATION_REUSE_GRACE_MS + 1_000;

// NOTE: the refresh grant reads the refresh token from the session cookies
// when they are present, and only falls back to the Authorization header
// once the cookies are cleared. Every redemption below that must present a
// *specific* captured token therefore runs after cy.clearCookies().
function redeemRefreshToken(refreshToken: string) {
  return cy.request({
    method: "POST",
    url: `/api/auth/token/refresh_token/${APP_ID}`,
    body: {
      grant_type: "refresh_token",
      // token audiences use the auth server URL, not the app id
      audience: Cypress.env("AUTH_SERVER_URL"),
      client_app_id: APP_ID,
    },
    headers: {
      Authorization: `Bearer ${refreshToken}`,
      "Content-Type": "application/json",
      Origin: new URL(Cypress.config("baseUrl")!).origin,
    },
    failOnStatusCode: false,
  });
}

describe("Refresh Token Rotation", () => {
  it("rotates the refresh token on every redemption, tolerates reuse within the grace window, and rejects it afterwards", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(
          success,
          "create_and_login_as_regular_user should succeed",
        ).to.be.true;

        cy.getCookie(REFRESH_TOKEN_COOKIE)
          .should("exist")
          .then((cookie) => {
            if (!cookie || !cookie.value) {
              throw new Error("Refresh token cookie not found after login");
            }
            const originalToken: string = cookie.value;

            // Redeem the original token: must succeed and rotate — the
            // response replaces the refresh cookie with a new token.
            redeemRefreshToken(originalToken).then((firstRedemption) => {
              expect(firstRedemption.status).to.eq(200);
              expect(firstRedemption.body.success).to.eq(true);
            });

            cy.getCookie(REFRESH_TOKEN_COOKIE)
              .should("exist")
              .then((rotatedCookie) => {
                if (!rotatedCookie || !rotatedCookie.value) {
                  throw new Error(
                    "Rotated refresh token cookie not found after redemption",
                  );
                }
                const rotatedToken: string = rotatedCookie.value;
                expect(
                  rotatedToken,
                  "Redemption must rotate the refresh token cookie",
                ).to.not.eq(originalToken);

                // Cookies take precedence over the Authorization header at
                // the refresh endpoint; clear them so each request below
                // redeems exactly the token it presents.
                cy.clearCookies();

                // Within the reuse grace window, replaying the just-used
                // token is tolerated — this is what keeps benign
                // concurrent refreshes (parallel tabs) from killing the
                // session.
                redeemRefreshToken(originalToken).then((graceReplay) => {
                  expect(
                    graceReplay.status,
                    "Reuse within the grace window should be tolerated",
                  ).to.eq(200);
                  expect(graceReplay.body.success).to.eq(true);
                });

                // The grace redemption above rotated again and set a new
                // cookie — clear it so later requests stay Bearer-only.
                cy.clearCookies();

                // Once the grace window has elapsed, the used token is
                // dead: replaying it must be rejected as revoked.
                cy.wait(WAIT_PAST_GRACE_MS);
                redeemRefreshToken(originalToken).then((lateReplay) => {
                  expect(
                    lateReplay.status,
                    "Reuse after the grace window must be rejected",
                  ).to.eq(401);
                  expect(lateReplay.body.success).to.eq(false);
                  expect(lateReplay.body.message).to.include("revoked");
                });

                // A rotated-to token that was never redeemed stays valid —
                // rotation only kills tokens upon use.
                redeemRefreshToken(rotatedToken).then((unusedRedemption) => {
                  expect(
                    unusedRedemption.status,
                    "An unused rotated token must remain redeemable",
                  ).to.eq(200);
                  expect(unusedRedemption.body.success).to.eq(true);
                });
              });
          });
      });
    });
  });
});
