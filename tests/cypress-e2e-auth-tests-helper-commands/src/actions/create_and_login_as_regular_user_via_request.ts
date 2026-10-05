import type { UserCredentialsMaybeWithInviteCode } from "./create_and_login_as_regular_user";
import provisionInviteCodeViaRequest from "./provision_invite_code_via_request";

/**
 * Faster equivalent of cy.create_and_login_as_regular_user(): registers via
 * cy.register_via_request instead of driving the registration form. When an
 * invite code is required and none was supplied, one is created through the
 * admin API as the superuser, so the whole flow is request-only.
 */
export default function createAndLoginAsRegularUserViaRequest(
  credentials: UserCredentialsMaybeWithInviteCode,
): Cypress.Chainable<boolean> {
  const invite_code_provided: boolean = credentials.invite_code ? true : false;

  function registerAndAssert(
    creds: UserCredentialsMaybeWithInviteCode,
  ): Cypress.Chainable<boolean> {
    return cy
      .is_authenticated()
      .then((authenticated: boolean): Cypress.Chainable<boolean> => {
        if (authenticated) {
          cy.logout();
        }
        return cy
          .register_via_request(creds.email, creds.password, creds.invite_code)
          .then((status_code: number): Cypress.Chainable<boolean> => {
            if (status_code !== 200) {
              throw new Error(
                `Failed to register as new user '${creds.email}' via request (status ${status_code})`,
              );
            }
            return cy.wrap(true, { log: false });
          });
      });
  }

  return cy
    .is_invite_code_required()
    .then((invite_code_required: boolean): Cypress.Chainable<boolean> => {
      if (!invite_code_required) {
        return registerAndAssert(credentials);
      }

      if (invite_code_provided) {
        return registerAndAssert(credentials);
      }

      return provisionInviteCodeViaRequest().then((invite_code: string) =>
        registerAndAssert({ ...credentials, invite_code }),
      );
    });
}
