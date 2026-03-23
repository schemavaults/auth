class SuperuserCreatedCache {
  public static created: boolean = false;
}

function onSuperuserAlreadyExistsError(credentials: {
  email: string;
  password: string;
}) {
  cy.log(`Found error toast with message: 'already exists'`);
  cy.log(`Attempting to login as existing superuser...`);
  const existing_superuser_login_result: Cypress.Chainable<boolean> = cy
    .login(credentials.email, credentials.password)
    .then((login_success: boolean): Cypress.Chainable<boolean> => {
      if (login_success) {
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
    });

  return existing_superuser_login_result;
}

export default function createAndLoginAsSuperuser(): Cypress.Chainable<boolean> {
  cy.is_authenticated().should("be.false");

  const credentials = {
    email: Cypress.env("PRIVATE_SUPERUSER_EMAIL"),
    password: Cypress.env("PRIVATE_SUPERUSER_PASSWORD"),
  };

  if (!credentials.email || !credentials.password) {
    throw new Error(
      "PRIVATE_SUPERUSER_EMAIL and PRIVATE_SUPERUSER_PASSWORD environment variables are not set",
    );
  }
  if (Cypress.env("PRIVATE_SUPERUSER_PRECREATED") || SuperuserCreatedCache.created) {
    cy.log(
      Cypress.env("PRIVATE_SUPERUSER_PRECREATED")
        ? "Superuser was pre-registered before test suite-- attempting to login right away..."
        : "Superuser appears to be marked as already created-- attempting to login right away...",
    );
    return cy
      .login(credentials.email, credentials.password)
      .then((success: boolean) => {
        if (!success) {
          cy.log("Failed to login as existing superuser!");
          return cy.wrap(false, { log: false });
        }
        cy.url({ log: false }).should("not.include", "/auth/login");
        cy.url({ log: false }).should("include", "/account");
        return cy.wrap(true, { log: false });
      })
      .then((res) => {
        if (typeof res === "boolean") return res;
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
    .then((register_success_code: number): Cypress.Chainable<boolean> => {
      if (register_success_code === 200) {
        cy.log("Registration appears to have been successful!");
        cy.url().should("not.include", "/auth/register");
        cy.url().should("include", "/account");
        SuperuserCreatedCache.created = true;
        return cy.wrap(true, { log: false });
      } else {
        cy.log("Registration failed");

        if (register_success_code === 409) {
          cy.log(
            "Received status code 409, a user already exists with superuser email!",
          );
          return onSuperuserAlreadyExistsError(credentials);
        }

        // register did not succeed
        return cy
          .has_error_toast("already exists")
          .then((alreadyExistsError: boolean): Cypress.Chainable<boolean> => {
            if (alreadyExistsError) {
              return onSuperuserAlreadyExistsError(credentials);
            } else {
              throw new Error(
                "Registration failed and did not also receive an 'already exists' error message!",
              );
            }
          });
      }
    })
    .then((res) => {
      if (typeof res === "boolean") return res;
      const val: boolean = res[0];
      return val;
    });
}
