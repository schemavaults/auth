/**
 * Clears all Redis rate-limit keys in the test auth-server so subsequent
 * login/register/etc. calls don't trip over 429 responses from earlier tests.
 *
 * Only works when the auth-server is running with getAppEnvironment() === 'test'.
 */
export default function resetRateLimit(): Cypress.Chainable<boolean> {
  return cy
    .request({
      method: "POST",
      url: "/api/test/reset-rate-limit",
      failOnStatusCode: false,
      log: false,
    })
    .then((response): Cypress.Chainable<boolean> => {
      if (response.status === 200) {
        cy.log(
          `Reset rate limits (deleted ${response.body?.deleted ?? "?"} key(s))`,
        );
        return cy.wrap(true, { log: false });
      }
      cy.log(
        `Failed to reset rate limits: status ${response.status}. ` +
          `Is this running against a test-environment auth-server?`,
      );
      return cy.wrap(false, { log: false });
    });
}
