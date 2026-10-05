const INVITE_CODE_LENGTH = 24;

/**
 * Creates a single-use registration invite code as the superuser, entirely
 * through the API (no admin UI), and yields it. Ends the session that was
 * active when called (cy.logout()) and the superuser session it opens, so the
 * browser is signed out afterwards, ready to register a new user.
 */
export default function provisionInviteCodeViaRequest(): Cypress.Chainable<string> {
  return cy
    .is_authenticated()
    .then((authenticated: boolean): Cypress.Chainable<boolean> => {
      if (authenticated) {
        cy.logout();
      }
      return cy.create_and_login_as_superuser_via_request();
    })
    .then((success: boolean): Cypress.Chainable<string> => {
      if (!success) {
        throw new Error("Failed to login as superuser!");
      }
      return cy.generate_random_code(INVITE_CODE_LENGTH);
    })
    .then(
      (invite_code: string): Cypress.Chainable<string> =>
        cy.create_invite_code_via_request(invite_code, 1).then(() => {
          cy.logout_via_request();
          return cy.wrap(invite_code, { log: false });
        }),
    );
}
