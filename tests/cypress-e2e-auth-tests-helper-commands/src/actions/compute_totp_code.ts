// otplib's default HMAC implementation calls `crypto.createHmac`, which
// only exists on Node — so importing `otplib` directly into a Cypress
// spec throws "crypto.createHmac is not a function" the moment the
// spec runs in the browser. Delegate the computation to a Node-side
// `cy.task` registered by `cypress.config.ts` instead.
//
// The auth server refuses a TOTP code whose time step the factor already
// accepted, so the task never yields a code for the same time step twice
// per secret: it may return the next step's code, or wait (≤ 30 s) for the
// next step to begin. To replay a code, reuse the string you got.

export default function compute_totp_code(
  secret: string,
): Cypress.Chainable<string> {
  return cy.task<string>("computeTotpCode", secret);
}
