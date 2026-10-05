import provisionInviteCodeViaRequest from "./provision_invite_code_via_request";

export interface UserCredentials {
  email: string;
  password: string;
}

export interface UserCredentialsMaybeWithInviteCode {
  email: string;
  password: string;
  invite_code?: string;
}

/**
 * Creates a regular user by registering through the registration form. When
 * an invite code is required and none was supplied, one is first created
 * through the admin API as the superuser.
 */
export default function createAndLoginAsRegularUser(
  credentials: UserCredentialsMaybeWithInviteCode,
): Cypress.Chainable<boolean> {
  const invite_code_provided_to_cy_command: boolean = credentials.invite_code
    ? true
    : false;
  cy.log(
    `Attempting to login as regular user '${credentials.email}'` +
      invite_code_provided_to_cy_command
      ? ` (with invite code '${credentials.invite_code}')`
      : "",
  );

  function onCreateUserReady(
    credentials: UserCredentialsMaybeWithInviteCode,
  ): Cypress.Chainable<boolean> {
    return cy
      .is_authenticated()
      .then((authenticated: boolean): Cypress.Chainable<boolean> => {
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

  function createInviteCodeAndThenRegisterIfOneNotProvided(): Cypress.Chainable<boolean> {
    return provisionInviteCodeViaRequest()
      .then((invite_code: string) => {
        return onCreateUserReady({
          ...credentials,
          invite_code,
        }).then(() => {
          return cy.wrap(true, { log: false });
        });
      });
  }

  return cy
    .is_invite_code_required()
    .then((invite_code_required: boolean): Cypress.Chainable<boolean> => {
      if (invite_code_required) {
        if (invite_code_provided_to_cy_command) {
          return onCreateUserReady(credentials);
        } else {
          return createInviteCodeAndThenRegisterIfOneNotProvided();
        }
      } else {
        return cy
          .register(
            credentials.email,
            credentials.password,
            credentials.invite_code ?? undefined,
          )
          .then(
            (status_code: number): Cypress.Chainable<boolean> =>
              cy.wrap(status_code === 200, { log: false }),
          );
      }
    });
}
