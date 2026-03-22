export interface UserCredentials {
  email: string;
  password: string;
}

export default function generate_random_test_user_credentials(): Cypress.Chainable<UserCredentials> {
  return cy
    .generate_random_code(12)
    .then((random_suffix: string): Cypress.Chainable<UserCredentials> => {
      const credentials: UserCredentials = {
        email: `test-user-${random_suffix}@example.com`,
        password: "TestPassword123!",
      };
      return cy.wrap(credentials, { log: false });
    });
}
