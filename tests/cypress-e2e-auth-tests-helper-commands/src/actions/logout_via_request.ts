import {
  AccessTokenCookieName,
  AccessTokenExpiryCookieName,
  RefreshTokenCookieName,
} from "@schemavaults/auth-common";
import getAuthServerAppIdFromCypressEnv from "../get-auth-server-app-id-from-cypress-env";

/**
 * Faster equivalent of cy.logout(): ends the auth-server session by POSTing
 * to /api/auth/logout/{auth server app id} (which revokes the session's
 * refresh token and clears its cookies) instead of clicking "Sign out" on the
 * account page. Also drops the access-token cookies the auth client keeps in
 * the browser, as its own sign-out does.
 */
export default function logout_via_request(): void {
  const auth_app_id = getAuthServerAppIdFromCypressEnv();

  cy.request({
    method: "POST",
    url: `/api/auth/logout/${auth_app_id}`,
    // The auth server's own app is a web app: its logout requires the app's
    // Origin.
    headers: { Origin: new URL(Cypress.config("baseUrl")!).origin },
    failOnStatusCode: false,
  }).then((response): void => {
    expect(response.status, "logout request status").to.eq(200);
    cy.clearCookie(AccessTokenCookieName(auth_app_id));
    cy.clearCookie(AccessTokenExpiryCookieName(auth_app_id));
    cy.getCookie(RefreshTokenCookieName(auth_app_id)).should("not.exist");
    cy.is_authenticated().should(
      "equal",
      false,
      "User should not be authenticated after cy.logout_via_request",
    );
  });
}
