import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import { RefreshTokenCookieName } from "@schemavaults/auth-common";

const APP_ID = getAuthServerAppIdFromCypressEnv();
const REFRESH_TOKEN_COOKIE = RefreshTokenCookieName(APP_ID);

// Must exceed REFRESH_TOKEN_ROTATION_REUSE_GRACE_MS (10s) on the server.
const ROTATION_REUSE_GRACE_MS = 10_000;
const WAIT_PAST_GRACE_MS = ROTATION_REUSE_GRACE_MS + 1_000;

// Redeems a *specific* refresh token at the OIDC token endpoint (RFC 6749
// §6, form-encoded). The explicit `refresh_token` parameter takes
// precedence over the session cookie, so each request redeems exactly the
// token it presents. The auth server's own app always gets the rotated
// refresh token back as an HTTP-only cookie (never in the JSON body).
function redeemRefreshToken(refreshToken: string) {
  return cy.request({
    method: "POST",
    url: "/api/oidc/token",
    form: true,
    body: {
      grant_type: "refresh_token",
      client_id: APP_ID,
      refresh_token: refreshToken,
    },
    headers: {
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
              expect(firstRedemption.body.access_token).to.be.a("string");
              expect(firstRedemption.body).to.not.have.property(
                "refresh_token",
              );
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

                // Drop the rotated session cookie so the requests below
                // only ever carry the token they present explicitly.
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
                  expect(graceReplay.body.access_token).to.be.a("string");
                });

                // The grace redemption above rotated again and set a new
                // cookie — clear it so later requests stay cookie-free.
                cy.clearCookies();

                // Once the grace window has elapsed, the used token is
                // dead: replaying it must be rejected as revoked.
                cy.wait(WAIT_PAST_GRACE_MS);
                redeemRefreshToken(originalToken).then((lateReplay) => {
                  expect(
                    lateReplay.status,
                    "Reuse after the grace window must be rejected",
                  ).to.eq(400);
                  expect(lateReplay.body.error).to.eq("invalid_grant");
                  expect(lateReplay.body.error_description).to.include(
                    "revoked",
                  );
                  expect(lateReplay.body).to.not.have.property("access_token");
                });

                // A rotated-to token that was never redeemed stays valid —
                // rotation only kills tokens upon use.
                redeemRefreshToken(rotatedToken).then((unusedRedemption) => {
                  expect(
                    unusedRedemption.status,
                    "An unused rotated token must remain redeemable",
                  ).to.eq(200);
                  expect(unusedRedemption.body.access_token).to.be.a("string");
                });
              });
          });
      });
    });
  });
});
