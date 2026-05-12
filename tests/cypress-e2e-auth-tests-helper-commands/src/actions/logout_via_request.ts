import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-common";

/**
 * Faster equivalent of cy.logout(): clears the auth-server refresh-token
 * cookies directly instead of driving the sign-out button through the UI.
 *
 * Test users are randomly generated per test, so leaving the underlying JTI
 * un-revoked server-side has no practical consequence between tests.
 */
export default function logout_via_request(): Cypress.Chainable<void> {
  const refresh_token_cookie = RefreshTokenCookieName(
    SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
  );
  const refresh_token_expiry_cookie = RefreshTokenExpiryCookieName(
    SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
  );

  cy.clearCookie(refresh_token_cookie);
  cy.clearCookie(refresh_token_expiry_cookie);

  cy.getCookie(refresh_token_cookie).should("not.exist");
  cy.getCookie(refresh_token_expiry_cookie).should("not.exist");

  cy.is_authenticated().should(
    "equal",
    false,
    "User should not be authenticated after cy.logout_via_request",
  );
  return cy.wrap<void>(undefined, { log: false });
}
