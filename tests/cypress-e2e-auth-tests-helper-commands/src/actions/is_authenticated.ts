import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";

export default function is_authenticated(): Cypress.Chainable<boolean> {
  cy.log(`[cy.is_authenticated()] Checking if authenticated...`);
  return cy
    .request({
      method: "GET",
      url: `/api/auth/whoami/${SCHEMAVAULTS_AUTH_APP_ID}`,
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
