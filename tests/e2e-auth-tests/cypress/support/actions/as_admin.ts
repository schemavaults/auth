export default function as_admin<T>(
  callback: () => Cypress.Chainable<T>,
): Cypress.Chainable<T> {
  return cy.is_admin().then((admin: boolean): Cypress.Chainable<T> => {
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
