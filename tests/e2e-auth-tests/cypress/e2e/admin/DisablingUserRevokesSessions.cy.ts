// DisablingUserRevokesSessions.cy.ts
//
// Disabling an account must end the sessions it already holds, not only
// refuse new logins: the route guards read `disabled` from the token claims,
// so a refresh-token cookie minted before the disable would otherwise keep
// full API and dashboard access until it expired. Disabling pins the user's
// tokens_valid_after watermark, so the pre-disable session is rejected at
// once (no second-boundary wait, unlike a password reset) and stays dead
// after the account is re-enabled; a fresh login then works again.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import { RefreshTokenCookieName } from "@schemavaults/auth-common";

const APP_ID = getAuthServerAppIdFromCypressEnv();
const REFRESH_TOKEN_COOKIE = RefreshTokenCookieName(APP_ID);

interface GuardedResponseBody {
  success?: boolean;
  message?: string;
}

interface WhoamiResponseBody {
  success: boolean;
  user?: { uid: string };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function getProfile(): Cypress.Chainable<Cypress.Response<GuardedResponseBody>> {
  return cy.request<GuardedResponseBody>({
    method: "GET",
    url: "/api/user/profile",
    failOnStatusCode: false,
  });
}

/**
 * Switches to the superuser (dropping the current cookies WITHOUT logging
 * out, which would revoke the session server-side) and POSTs (disable) or
 * DELETEs (re-enable) the target's disabled state.
 */
function setDisabledAsSuperuser(uid: string, disabled: boolean): void {
  cy.clearCookies();
  cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
    if (!ok) throw new Error("Failed to login as superuser");
  });
  cy.request({
    method: disabled ? "POST" : "DELETE",
    url: `/api/admin/users/${uid}/disable`,
  }).then((response) => {
    expect(response.status).to.eq(200);
    expect(response.body.resource_id).to.eq(uid);
  });
  cy.clearCookies();
}

describe("Disabling a user revokes their sessions", () => {
  it("rejects the pre-disable session at the route guards, even after re-enabling", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (success) => {
          expect(
            success,
            "create_and_login_as_regular_user_via_request should succeed",
          ).to.be.true;

          // Sanity: the live session reaches a guarded route.
          getProfile().then((response) => {
            expect(response.status, "guarded route with live session").to.eq(
              200,
            );
          });

          cy.request<WhoamiResponseBody>({
            method: "GET",
            url: `/api/auth/whoami/${APP_ID}`,
          }).then((whoami) => {
            const uid = whoami.body.user?.uid;
            if (!uid) throw new Error("whoami did not return the user's uid");

            cy.getCookie(REFRESH_TOKEN_COOKIE)
              .should("exist")
              .then((cookie) => {
                if (!cookie || !cookie.value) {
                  throw new Error("Refresh token cookie not found");
                }
                // The session the disabled user (or whoever stole the
                // cookie) holds on to.
                const capturedRefreshToken: string = cookie.value;

                setDisabledAsSuperuser(uid, true);

                cy.setCookie(REFRESH_TOKEN_COOKIE, capturedRefreshToken);
                getProfile().then((response) => {
                  expect(
                    response.status,
                    "guarded route with the session of a disabled user",
                  ).to.eq(401);
                  expect(response.body.message).to.include("revoked");
                });

                setDisabledAsSuperuser(uid, false);

                // Re-enabling does not bring the old session back.
                cy.setCookie(REFRESH_TOKEN_COOKIE, capturedRefreshToken);
                getProfile().then((response) => {
                  expect(
                    response.status,
                    "guarded route with a pre-disable session after re-enabling",
                  ).to.eq(401);
                  expect(response.body.message).to.include("revoked");
                });
                cy.clearCookies();

                // ...but the re-enabled user can log in and use a fresh one.
                cy.login_via_request(credentials.email, credentials.password).then(
                  (ok: boolean) => {
                    expect(ok, "re-enabled user should log in").to.be.true;
                  },
                );
                getProfile().then((response) => {
                  expect(
                    response.status,
                    "guarded route with a post-re-enable session",
                  ).to.eq(200);
                });
              });
          });
        },
      );
    });
  });
});
