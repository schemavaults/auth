export default function is_authenticated(): Cypress.Chainable<boolean> {
  return cy.request({
    method: "GET",
    url: "/api/auth/whoami",
    failOnStatusCode: false,
  }).then((response) => {
    if (response.status === 200) {
      return true;
    } else {
      return false;
    }
  });
}