/**
 * Marks a test user's e-mail address as verified through the real
 * verification flow, without driving the UI: mints a verification token via
 * the test-only `GET /api/test/email-verification-token/{email}` endpoint and
 * consumes it at the public `POST /api/auth/verify-email/confirm` endpoint.
 *
 * Needed by any spec that signs a user in to a THIRD-PARTY client app (e.g.
 * the example resource server): while the
 * `require_email_verification_for_third_party_apps` server setting is on
 * (the default), the auth server parks unverified accounts on
 * `/auth/verify-email/required` instead of handing them off to the app.
 *
 * The confirm endpoint is rate limited per IP; on a 429 the rate limits are
 * reset (test-only endpoint) and the confirmation retried once.
 *
 * Only works when the auth-server is running with getAppEnvironment() === 'test'.
 */
export default function verifyEmailViaRequest(
  email: string,
): Cypress.Chainable<boolean> {
  function confirm(token: string): Cypress.Chainable<number> {
    return cy
      .request({
        method: "POST",
        url: "/api/auth/verify-email/confirm",
        body: { token },
        failOnStatusCode: false,
        log: false,
      })
      .then((response): Cypress.Chainable<number> => {
        return cy.wrap(response.status, { log: false });
      });
  }

  return cy
    .request({
      method: "GET",
      url: `/api/test/email-verification-token/${encodeURIComponent(email)}`,
      failOnStatusCode: false,
      log: false,
    })
    .then((tokenResponse): Cypress.Chainable<boolean> => {
      const token: unknown = tokenResponse.body?.token;
      if (tokenResponse.status !== 200 || typeof token !== "string") {
        cy.log(
          `Failed to mint an email verification token for '${email}': status ${tokenResponse.status}. ` +
            `Is this running against a test-environment auth-server?`,
        );
        return cy.wrap(false, { log: false });
      }
      return confirm(token).then((status: number): Cypress.Chainable<boolean> => {
        if (status === 200) {
          cy.log(`Verified email address '${email}'`);
          return cy.wrap(true, { log: false });
        }
        if (status !== 429) {
          cy.log(`Failed to confirm email verification for '${email}': status ${status}`);
          return cy.wrap(false, { log: false });
        }
        // Rate limited: clear the test server's rate-limit keys and retry once.
        return cy
          .reset_rate_limit()
          .then((): Cypress.Chainable<number> => confirm(token))
          .then((retryStatus: number): Cypress.Chainable<boolean> => {
            if (retryStatus === 200) {
              cy.log(`Verified email address '${email}' (after rate-limit reset)`);
              return cy.wrap(true, { log: false });
            }
            cy.log(
              `Failed to confirm email verification for '${email}' after rate-limit reset: status ${retryStatus}`,
            );
            return cy.wrap(false, { log: false });
          });
      });
    });
}
