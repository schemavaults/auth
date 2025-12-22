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
    cy.login(credentials.email, credentials.password);
    cy.wait(6000);
    cy.url({ log: false }).should("not.include", "/auth/login");
    cy.url({ log: false }).should("include", "/account");
    return;
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

  cy.register(credentials.email, credentials.password, invite_code);

  cy.wait(2500);

  cy.url({ log: false }).then((url: string) => {
    cy.log("Registration should have completed by now; checking URL: ", url);
    const redirected: boolean = !url.includes("/auth/register");
    if (!redirected) {
      cy.log(
        "Submitting registration form does not seem to have redirected user.",
      );
      // if error message includes 'already exists', then try to login instead
      cy.has_error_toast("already exists").then(
        (alreadyExistsError: boolean) => {
          if (alreadyExistsError) {
            cy.log(`Found error toast with message: already exists`);
            cy.login(credentials.email, credentials.password);
            SuperuserCreatedCache.created = true;
            cy.wait(5000);
          }
        },
      );
      return;
    } else {
      cy.log("Submitting registration form appears to have redirected user.");
      // user was redirected off the register page
      cy.url().should("not.include", "/auth/register");
      cy.url().should("include", "/account");
      SuperuserCreatedCache.created = true;
    }
  });
}
