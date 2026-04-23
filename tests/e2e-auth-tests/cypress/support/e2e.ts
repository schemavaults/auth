// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import "./commands";

// contains a declare global that overwrites the Chainable interface on the Cypress module
import "@schemavaults/cypress-e2e-auth-tests-helper-commands/Chainable";

// "Unable to find valid context for frame" is a Chrome DevTools Protocol
// internal error that Cypress surfaces as an unhandled promise rejection when
// CDP evaluates against a frame that was detached mid-navigation (typical
// during cross-origin PKCE redirects and logout flows). It does not originate
// from app code — the auth client's logout chain handles its own rejections —
// so treat it as benign and let the test continue.
Cypress.on("uncaught:exception", (err) => {
  if (err?.message?.includes("Unable to find valid context for frame")) {
    return false;
  }
  return true;
});
