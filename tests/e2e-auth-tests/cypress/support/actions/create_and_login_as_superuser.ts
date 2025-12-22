class SuperuserCreatedCache {
  public static created: boolean = false;
}

export default function createAndLoginAsSuperuser() {
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
    cy.login(credentials.email, credentials.password).then(
      (success: boolean) => {
        if (!success) {
          throw new Error(
            "Failed to login as superuser despite it being marked as created",
          );
        }
        cy.url({ log: false }).should("not.include", "/auth/login");
        cy.url({ log: false }).should("include", "/account");
        return;
      },
    );
    return;
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

  cy.register(credentials.email, credentials.password, invite_code).then(
    (register_success: boolean) => {
      if (register_success) {
        cy.url().should("not.include", "/auth/register");
        cy.url().should("include", "/account");
        SuperuserCreatedCache.created = true;
      } else {
        cy.log("Registration failed");
        // register did not succeed
        cy.has_error_toast("already exists").then(
          (alreadyExistsError: boolean) => {
            if (alreadyExistsError) {
              cy.log(`Found error toast with message: 'already exists'`);
              cy.log(`Attempting to login as existing superuser...`);
              cy.login(credentials.email, credentials.password).then(
                (login_success) => {
                  if (login_success) {
                    cy.url().should("include", "/account");
                    SuperuserCreatedCache.created = true;
                  }
                },
              );
            } else {
              throw new Error(
                "Registration failed and did not also receive an 'already exists' error message!",
              );
            }
          },
        );
      }
    },
  );
}
