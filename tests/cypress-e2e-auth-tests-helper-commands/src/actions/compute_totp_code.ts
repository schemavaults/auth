import { authenticator } from "otplib";

// Cypress doesn't await Promises returned from synchronous helpers, but
// otplib's authenticator.generate is fully synchronous, so we expose it
// as a regular function returning the current TOTP code for a given
// secret. Mirrors the auth-server's TOTP_WINDOW = 1 setting so any code
// produced here verifies on the server.
authenticator.options = { window: 1 };

export default function compute_totp_code(
  secret: string,
): Cypress.Chainable<string> {
  return cy.wrap(authenticator.generate(secret));
}
