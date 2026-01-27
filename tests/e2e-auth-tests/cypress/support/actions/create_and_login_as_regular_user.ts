/**
 * Creates a regular user by:
 * Registering as a new regular user with that invite code
 *
 * Returns the credentials of the newly created user
 */
export interface RegularUserCredentials {
  email: string;
  password: string;
}

export default function createAndLoginAsRegularUser(): Cypress.Chainable<RegularUserCredentials> {
  // Step 1: Sign in as superuser
  const regular_user_login_result: Cypress.Chainable<RegularUserCredentials> =
    cy
      .create_and_login_as_superuser()
      .then((success: boolean): Cypress.Chainable<RegularUserCredentials> => {
        if (!success) {
          throw new Error("Failed to create/login as superuser");
        }

        cy.log("Superuser logged in, now creating invite code...");

        // Step 2: Create an invite code
        const INVITE_CODE_LENGTH = 24;
        return cy
          .generate_random_code(INVITE_CODE_LENGTH)
          .then(
            (
              invite_code: string,
            ): Cypress.Chainable<RegularUserCredentials> => {
              if (
                typeof invite_code !== "string" ||
                invite_code.length !== INVITE_CODE_LENGTH
              ) {
                throw new Error(
                  `Failed to generate valid invite code, got: '${invite_code}'`,
                );
              }

              cy.log(`Generated invite code: '${invite_code}'`);

              return cy
                .create_invite_code(invite_code, 1)
                .then(
                  (
                    created: boolean,
                  ): Cypress.Chainable<RegularUserCredentials> => {
                    if (!created) {
                      throw new Error("Failed to create invite code");
                    }

                    cy.log("Invite code created successfully, logging out...");

                    // Step 3: Sign out
                    cy.logout();

                    // Step 4: Register as new regular user
                    return cy
                      .generate_random_code(8)
                      .then(
                        (
                          random_suffix: string,
                        ): Cypress.Chainable<RegularUserCredentials> => {
                          const credentials: RegularUserCredentials = {
                            email: `test-user-${random_suffix}@example.com`,
                            password: "TestPassword123!",
                          };

                          cy.log(
                            `Registering new regular user: '${credentials.email}'`,
                          );

                          return cy
                            .register(
                              credentials.email,
                              credentials.password,
                              invite_code,
                            )
                            .then(
                              (
                                status_code: number,
                              ): Cypress.Chainable<RegularUserCredentials> => {
                                if (status_code !== 200) {
                                  throw new Error(
                                    `Failed to register regular user, got status: ${status_code}`,
                                  );
                                }

                                cy.log(
                                  `Successfully registered and logged in as regular user: '${credentials.email}'`,
                                );
                                cy.url().should("include", "/account");

                                return cy.wrap(credentials, { log: false });
                              },
                            );
                        },
                      );
                  },
                );
            },
          );
      });

  return regular_user_login_result;
}
