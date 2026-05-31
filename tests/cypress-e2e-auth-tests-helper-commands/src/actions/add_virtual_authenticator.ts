// Registers a CDP virtual WebAuthn authenticator and yields its id.
//
// Requires a Chromium-family browser (Chrome/Edge): the Chrome DevTools
// Protocol `WebAuthn` domain this relies on is unavailable under Electron
// (the default `cypress run` browser), so passkey specs must run with
// `--browser chrome`. The virtual authenticator stands in for a real
// platform/hardware authenticator so registration and assertion ceremonies
// succeed headlessly.
export function registerAddVirtualAuthenticatorCommand(
  commands: typeof Cypress.Commands,
): void {
  commands.add("add_virtual_authenticator", () => {
    return cy
      .then(() =>
        Cypress.automation("remote:debugger:protocol", {
          command: "WebAuthn.enable",
          params: { enableUI: false },
        }),
      )
      .then(() =>
        Cypress.automation("remote:debugger:protocol", {
          command: "WebAuthn.addVirtualAuthenticator",
          params: {
            options: {
              protocol: "ctap2",
              transport: "internal",
              hasResidentKey: true,
              hasUserVerification: true,
              isUserVerified: true,
              automaticPresenceSimulation: true,
            },
          },
        }),
      )
      .then((result) => {
        const authenticatorId = (result as { authenticatorId?: string })
          ?.authenticatorId;
        if (!authenticatorId) {
          throw new Error(
            "Failed to add CDP virtual authenticator — are you running with --browser chrome?",
          );
        }
        return authenticatorId;
      });
  });
}
