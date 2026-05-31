// Removes a CDP virtual WebAuthn authenticator previously created by
// cy.add_virtual_authenticator(). Pair it in an afterEach so authenticators
// don't leak across tests. See add_virtual_authenticator.ts for the
// Chromium-only caveat.

const cdpAutomation = Cypress.automation as unknown as (
  name: string,
  data?: object,
) => Promise<unknown>;

export default function remove_virtual_authenticator(
  authenticatorId: string,
): Cypress.Chainable<undefined> {
  return cy
    .then(() =>
      cdpAutomation("remote:debugger:protocol", {
        command: "WebAuthn.removeVirtualAuthenticator",
        params: { authenticatorId },
      }),
    )
    .then((): Cypress.Chainable<undefined> => cy.wrap(undefined, { log: false }));
}
