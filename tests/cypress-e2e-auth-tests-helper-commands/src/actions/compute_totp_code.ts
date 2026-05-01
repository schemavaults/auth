// otplib's default HMAC implementation calls `crypto.createHmac`, which
// only exists on Node — so importing `otplib` directly into a Cypress
// spec throws "crypto.createHmac is not a function" the moment the
// spec runs in the browser. Delegate the computation to a Node-side
// `cy.task` registered by `cypress.config.ts` instead.

export default function compute_totp_code(
  secret: string,
): Cypress.Chainable<string> {
  return cy.task<string>("computeTotpCode", secret);
}
