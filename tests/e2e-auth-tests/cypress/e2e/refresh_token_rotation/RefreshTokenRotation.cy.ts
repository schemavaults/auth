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

interface AuditLogResponseBody {
  data?: {
    entries?: {
      event_type: string;
      client_app_id: string | null;
      details: Record<string, unknown> | null;
    }[];
  };
}

// Captures the refresh token the last redemption rotated into the session
// cookie, then drops every cookie so later requests carry only the token
// they present explicitly.
function takeRotatedRefreshToken(): Cypress.Chainable<string> {
  return cy.getCookie(REFRESH_TOKEN_COOKIE).then((cookie) => {
    if (!cookie || !cookie.value) {
      throw new Error("Rotated refresh token cookie not found after redemption");
    }
    const token: string = cookie.value;
    cy.clearCookies();
    return cy.wrap(token, { log: false });
  });
}

describe("Refresh Token Rotation", () => {
  it("rotates the refresh token on every redemption, tolerates reuse within the grace window, and ends the whole session on reuse afterwards", () => {
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

            takeRotatedRefreshToken().then((rotatedToken) => {
              expect(
                rotatedToken,
                "Redemption must rotate the refresh token cookie",
              ).to.not.eq(originalToken);

              // Within the reuse grace window, replaying the just-used
              // token is tolerated — this is what keeps benign concurrent
              // refreshes (parallel tabs) from killing the session.
              redeemRefreshToken(originalToken).then((graceReplay) => {
                expect(
                  graceReplay.status,
                  "Reuse within the grace window should be tolerated",
                ).to.eq(200);
                expect(graceReplay.body.access_token).to.be.a("string");
              });
              // The grace redemption rotated again and set a new cookie.
              cy.clearCookies();

              // A rotated-to token that was never redeemed stays valid —
              // rotation only kills tokens upon use. Redeeming it moves the
              // chain on: its replacement is the session's live token, the
              // one a thief who rotated first would now hold.
              redeemRefreshToken(rotatedToken).then((unusedRedemption) => {
                expect(
                  unusedRedemption.status,
                  "An unused rotated token must remain redeemable",
                ).to.eq(200);
                expect(unusedRedemption.body.access_token).to.be.a("string");
              });

              takeRotatedRefreshToken().then((liveToken) => {
                // Once the grace window has elapsed, the used token is
                // dead: replaying it is rejected as revoked...
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
                cy.clearCookies();

                // ...and signals that two parties held it, so the whole
                // session is ended (RFC 9700 §4.14.2): the chain's live
                // refresh token, never redeemed, stops working too.
                redeemRefreshToken(liveToken).then((afterReuse) => {
                  expect(
                    afterReuse.status,
                    "Reuse must revoke the session's live refresh token",
                  ).to.eq(400);
                  expect(afterReuse.body.error).to.eq("invalid_grant");
                  expect(afterReuse.body.error_description).to.include(
                    "revoked",
                  );
                  expect(afterReuse.body).to.not.have.property("access_token");
                });
                cy.clearCookies();

                // A fresh sign-in starts a new session, and the account's
                // audit log says why the old one ended.
                cy.login_via_request(credentials.email, credentials.password).then(
                  (ok: boolean) => {
                    expect(ok, "a fresh login after the reuse").to.be.true;
                  },
                );
                cy.request<AuditLogResponseBody>(
                  "/api/me/audit-log?event_type=user.refresh_token_reused",
                ).then((response) => {
                  expect(response.status).to.eq(200);
                  const entries = response.body.data?.entries ?? [];
                  expect(entries, "one reuse event").to.have.length(1);
                  expect(entries[0].client_app_id).to.eq(APP_ID);
                  expect(entries[0].details?.revoked_tokens).to.be.a("number");
                });
              });
            });
          });
      });
    });
  });
});
