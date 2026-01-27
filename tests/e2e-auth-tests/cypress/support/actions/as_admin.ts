export default function as_admin(
  callback: () => Cypress.Chainable<void>,
): Cypress.Chainable<void> {
  return cy.is_admin().then((admin: boolean): Cypress.Chainable<void> => {
    if (admin) {
      return callback();
    }
    return cy.is_authenticated().then((authenticated) => {
      if (authenticated) {
        return cy.logout().then(() => {
          return cy.create_and_login_as_superuser().then((success: boolean) => {
            if (!success) {
              throw new Error("Failed to login as superuser!");
            }
            return callback();
          });
        });
      } else {
        return callback();
      }
    });
  });
}
