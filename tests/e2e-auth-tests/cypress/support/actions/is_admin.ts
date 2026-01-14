
export default function is_admin(): Cypress.Chainable<boolean> {
  return cy.request({
    method: "GET",
    url: "/api/auth/whoami",
    failOnStatusCode: false,
  }).then((response) => {
    if (response.status === 200) {
      const body = JSON.parse(response.body);
      if (typeof body === 'object' && body) {
        const user = body.user;
        if (user && typeof user === 'object' && 'admin' in user && user.admin === true) {
          return true;
        }
      }
    }
    return false;
  });
}