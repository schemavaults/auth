import getAuthServerAppIdFromCypressEnv from "../get-auth-server-app-id-from-cypress-env";

export default function is_authenticated(): Cypress.Chainable<boolean> {
  cy.log(`[cy.is_authenticated()] Checking if authenticated...`);
  return cy
    .request({
      method: "GET",
      url: `/api/auth/whoami/${getAuthServerAppIdFromCypressEnv()}`,
      failOnStatusCode: false,
    })
    .then((response): boolean => {
      if (response.status === 200) {
        return true;
      } else {
        return false;
      }
    });
}
