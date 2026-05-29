/// <reference types="cypress" />

import { registerAllActionCommands } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
// declare global {
//   namespace Cypress {
//     interface Chainable {
//       login(email: string, password: string): Chainable<void>
//       drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
//     }
//   }
// }

registerAllActionCommands(Cypress.Commands);

// ---------------------------------------------------------------------------
// WebAuthn virtual authenticator (Chrome DevTools Protocol)
//
// Passkey E2E tests drive a real WebAuthn ceremony in the browser. A CDP
// virtual authenticator stands in for a hardware/platform authenticator so
// registration + assertion succeed headlessly. Requires a Chromium-family
// browser (Chrome/Edge) — these commands no-op-fail under Electron, so the
// passkey spec should run with `--browser chrome`.
// ---------------------------------------------------------------------------

function cdp(command: string, params: Record<string, unknown> = {}) {
  return Cypress.automation("remote:debugger:protocol", { command, params });
}

Cypress.Commands.add("add_virtual_authenticator", () => {
  return cy
    .then(() => cdp("WebAuthn.enable", { enableUI: false }))
    .then(() =>
      cdp("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
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

Cypress.Commands.add(
  "remove_virtual_authenticator",
  (authenticatorId: string) => {
    return cy
      .then(() => cdp("WebAuthn.removeVirtualAuthenticator", { authenticatorId }))
      .then(() => undefined);
  },
);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Register a CDP virtual WebAuthn authenticator and resolve with its
       * id. Requires a Chromium-family browser.
       */
      add_virtual_authenticator(): Chainable<string>;
      /** Remove a previously-added CDP virtual authenticator by id. */
      remove_virtual_authenticator(
        authenticatorId: string,
      ): Chainable<undefined>;
    }
  }
}
