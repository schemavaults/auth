// Removes a CDP virtual WebAuthn authenticator previously created by
// cy.add_virtual_authenticator(). Pair it in an afterEach so authenticators
// don't leak across tests. See add_virtual_authenticator.ts for the
// Chromium-only caveat.
export function registerRemoveVirtualAuthenticatorCommand(
  commands: typeof Cypress.Commands,
): void {
  commands.add(
    "remove_virtual_authenticator",
    (authenticatorId: string) => {
      return cy
        .then(() =>
          Cypress.automation("remote:debugger:protocol", {
            command: "WebAuthn.removeVirtualAuthenticator",
            params: { authenticatorId },
          }),
        )
        .then(() => undefined);
    },
  );
}
