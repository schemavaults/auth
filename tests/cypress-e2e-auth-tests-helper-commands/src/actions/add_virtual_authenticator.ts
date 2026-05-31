// Registers a CDP virtual WebAuthn authenticator and yields its id.
//
// Requires a Chromium-family browser (Chrome/Edge): the Chrome DevTools
// Protocol `WebAuthn` domain this relies on is unavailable under Electron
// (the default `cypress run` browser), so passkey specs must run with
// `--browser chrome`. The virtual authenticator stands in for a real
// platform/hardware authenticator so registration and assertion ceremonies
// succeed headlessly.

// Cypress.automation's published overloads confuse TS arg-count inference for
// the CDP `remote:debugger:protocol` command, so alias it to the documented
// 2-arg promise signature.
const cdpAutomation = Cypress.automation as unknown as (
  name: string,
  data?: object,
) => Promise<unknown>;

export default function add_virtual_authenticator(): Cypress.Chainable<string> {
  return cy
    .then(() =>
      cdpAutomation("remote:debugger:protocol", {
        command: "WebAuthn.enable",
        params: { enableUI: false },
      }),
    )
    .then(() =>
      cdpAutomation("remote:debugger:protocol", {
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
    .then((result): Cypress.Chainable<string> => {
      const authenticatorId = (result as { authenticatorId?: string })
        ?.authenticatorId;
      if (!authenticatorId) {
        throw new Error(
          "Failed to add CDP virtual authenticator — are you running with --browser chrome?",
        );
      }
      return cy.wrap(authenticatorId, { log: false });
    });
}
