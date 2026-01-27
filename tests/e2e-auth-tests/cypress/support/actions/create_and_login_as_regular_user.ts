import { createInviteCodeAsAdmin } from "./create_invite_code";

/**
 * Creates a regular user by:
 * Registering as a new regular user with that invite code
 *
 * Returns the credentials of the newly created user
 */
export interface UserCredentials {
  email: string;
  password: string;
}

export interface UserCredentialsMaybeWithInviteCode {
  email: string;
  password: string;
  invite_code?: string;
}

const INVITE_CODE_LENGTH = 24;
function generateRandomInviteCode(): Cypress.Chainable<string> {
  return cy.generate_random_code(INVITE_CODE_LENGTH);
}

export default function createAndLoginAsRegularUser(
  credentials: UserCredentials,
): Cypress.Chainable<boolean> {
  function onCreateUserReady(
    credentials: UserCredentialsMaybeWithInviteCode,
  ): Cypress.Chainable<boolean> {
    return cy
      .is_authenticated()
      .then((authenticated): Cypress.Chainable<boolean> => {
        if (authenticated) {
          cy.logout();
        }

        const registerResult: Cypress.Chainable<number> = cy.register(
          credentials.email,
          credentials.password,
          credentials.invite_code,
        );
        return registerResult.then(
          (statusCode: number): Cypress.Chainable<boolean> => {
            if (statusCode !== 200) {
              throw new Error(
                `Failed to register as new user '${credentials.email}': (Status Code: ${statusCode})`,
              );
            }
            return cy.wrap(true, { log: false });
          },
        );
      });
  }

  return cy
    .is_invite_code_required()
    .then((invite_code_required: boolean): Cypress.Chainable<boolean> => {
      if (invite_code_required) {
        return cy
          .as_admin((): Cypress.Chainable<string> => {
            return generateRandomInviteCode().then((invite_code: string) => {
              return cy
                .create_invite_code(invite_code, 1)
                .then((success: boolean) => {
                  if (!success) {
                    throw new Error("Failed to create new invite code!");
                  }
                  return cy.wrap(invite_code, { log: false });
                });
            });
          })
          .then((invite_code: string) => {
            return onCreateUserReady({
              ...credentials,
              invite_code,
            }).then(() => {
              return cy.wrap(true, { log: false });
            });
          });
      } else {
        return cy
          .register(credentials.email, credentials.password)
          .then((status_code: number) =>
            cy.wrap(status_code === 200, { log: false }),
          );
      }
    });
}
