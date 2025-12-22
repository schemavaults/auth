class SuperuserCreatedCache {
  public static created: boolean = false;
}

export default function createAndLoginAsSuperuser(): Cypress.Chainable<boolean> {
  const credentials = {
    email: Cypress.env("PRIVATE_SUPERUSER_EMAIL"),
    password: Cypress.env("PRIVATE_SUPERUSER_PASSWORD"),
  };
  if (!credentials.email || !credentials.password) {
    throw new Error(
      "PRIVATE_SUPERUSER_EMAIL and PRIVATE_SUPERUSER_PASSWORD environment variables are not set",
    );
  }
  if (SuperuserCreatedCache.created) {
    cy.log(
      "Superuser appears to be marked as already created-- attempting to login right away...",
    );
    return cy
      .login(credentials.email, credentials.password)
      .then((success: boolean) => {
        if (!success) {
          cy.log("Failed to login as existing superuser!");
          return cy.wrap(false, { log: false });
        }
        cy.wait(3000);
        cy.url({ log: false }).should("not.include", "/auth/login");
        cy.url({ log: false }).should("include", "/account");
        return cy.wrap(true, { log: false });
      })
      .then((res) => {
        const val: boolean = res[0];
        return val;
      });
  } else {
    cy.log(
      "Superuser is not marked as already existing; proceeding to attempt creation...",
    );
  }

  const invite_code: string | undefined = Cypress.env(
    "PRIVATE_SUPERUSER_INVITE_CODE",
  );
  if (!invite_code) {
    throw new Error(
      "PRIVATE_SUPERUSER_INVITE_CODE environment variable is not set",
    );
  }

  cy.log(`Attempting to create superuser with invite code: '${invite_code}'`);

  return cy
    .register(credentials.email, credentials.password, invite_code)
    .then((register_success: boolean): Cypress.Chainable<JQuery<boolean>> => {
      if (register_success) {
        cy.log("Registration appears to have been successful!");
        return cy.wait(4000).then(() => {
          cy.url().should("not.include", "/auth/register");
          cy.url().should("include", "/account");
          SuperuserCreatedCache.created = true;
          return cy.wrap(true, { log: false });
        });
      } else {
        cy.log("Registration failed");
        // register did not succeed
        return cy
          .has_error_toast("already exists")
          .then(
            (
              alreadyExistsError: boolean,
            ): Cypress.Chainable<JQuery<boolean>> => {
              if (alreadyExistsError) {
                cy.log(`Found error toast with message: 'already exists'`);
                cy.log(`Attempting to login as existing superuser...`);
                const existing_superuser_login_result: Cypress.Chainable<
                  JQuery<boolean>
                > = cy
                  .login(credentials.email, credentials.password)
                  .then(
                    (
                      login_success: boolean,
                    ): Cypress.Chainable<JQuery<boolean>> => {
                      if (login_success) {
                        cy.wait(3000);
                        cy.url().should("include", "/account");
                        cy.log(
                          "Logging in as existing superuser appears to have been a success!",
                        );
                        SuperuserCreatedCache.created = true;
                        return cy.wrap(true, { log: false });
                      } else {
                        cy.log("Login as existing superuser failed");
                        return cy.wrap(false, { log: false });
                      }
                    },
                  );

                return existing_superuser_login_result;
              } else {
                throw new Error(
                  "Registration failed and did not also receive an 'already exists' error message!",
                );
              }
            },
          );
      }
    })
    .then((res: JQuery<boolean>) => {
      const val: boolean = res[0];
      return val;
    });
}
