import type { UserCredentialsMaybeWithInviteCode } from "./create_and_login_as_regular_user";

const INVITE_CODE_LENGTH = 24;

function generateRandomInviteCode(): Cypress.Chainable<string> {
  return cy.generate_random_code(INVITE_CODE_LENGTH);
}

/**
 * Faster equivalent of cy.create_and_login_as_regular_user(): registers via
 * cy.register_via_request instead of driving the registration form.
 *
 * The invite-code provisioning path (when one is required and none was
 * supplied) still goes through the admin UI because no API equivalent exists
 * yet — but tests that already pass an invite_code get an end-to-end
 * request-only flow.
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
          cy.logout_via_request();
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

      // Need an invite code; the admin invite-code endpoint is UI-only today,
      // so fall through to cy.as_admin to provision one. This keeps the test
      // green at the cost of one slow UI traversal per invocation.
      return cy
        .as_admin((): Cypress.Chainable<string> => {
          return generateRandomInviteCode().then((invite_code: string) => {
            return cy
              .create_invite_code(invite_code, 1)
              .then((success: boolean) => {
                if (!success) {
                  throw new Error("Failed to create new invite code!");
                }
                return cy.wrap(invite_code, { log: false });
              });
          });
        })
        .then((invite_code: string) => {
          return cy.logout_via_request().then(() => {
            return registerAndAssert({ ...credentials, invite_code });
          });
        });
    });
}
