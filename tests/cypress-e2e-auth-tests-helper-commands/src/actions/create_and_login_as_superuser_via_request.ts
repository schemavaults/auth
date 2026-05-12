class SuperuserCreatedCache {
  public static created: boolean = false;
}

/**
 * Faster equivalent of cy.create_and_login_as_superuser(): goes through the
 * request-based login/register path (cy.login_via_request /
 * cy.register_via_request) instead of driving the auth-server's UI forms.
 *
 * Designed for suites where the superuser is pre-registered by the Cypress
 * `before:run` hook (PRIVATE_SUPERUSER_PRECREATED=true) — the common case.
 */
export default function createAndLoginAsSuperuserViaRequest(): Cypress.Chainable<boolean> {
  cy.is_authenticated().should(
    "be.false",
    "User should not be authenticated before superuser login",
  );

  const credentials = {
    email: Cypress.env("PRIVATE_SUPERUSER_EMAIL"),
    password: Cypress.env("PRIVATE_SUPERUSER_PASSWORD"),
  };

  if (!credentials.email || !credentials.password) {
    throw new Error(
      "PRIVATE_SUPERUSER_EMAIL and PRIVATE_SUPERUSER_PASSWORD environment variables are not set",
    );
  }

  if (
    Cypress.env("PRIVATE_SUPERUSER_PRECREATED") ||
    SuperuserCreatedCache.created
  ) {
    return cy
      .login_via_request(credentials.email, credentials.password)
      .then((success: boolean) => {
        if (!success) {
          cy.log("Failed to login as existing superuser via request!");
          return cy.wrap(false, { log: false });
        }
        SuperuserCreatedCache.created = true;
        return cy.wrap(true, { log: false });
      });
  }

  const invite_code: string | undefined = Cypress.env(
    "PRIVATE_SUPERUSER_INVITE_CODE",
  );
  if (!invite_code) {
    throw new Error(
      "PRIVATE_SUPERUSER_INVITE_CODE environment variable is not set",
    );
  }

  return cy
    .register_via_request(credentials.email, credentials.password, invite_code)
    .then((status_code: number): Cypress.Chainable<boolean> => {
      if (status_code === 200) {
        SuperuserCreatedCache.created = true;
        return cy.wrap(true, { log: false });
      }
      if (status_code === 409) {
        // Already exists — fall back to login
        return cy
          .login_via_request(credentials.email, credentials.password)
          .then((login_success: boolean) => {
            if (login_success) {
              SuperuserCreatedCache.created = true;
            }
            return cy.wrap(login_success, { log: false });
          });
      }
      throw new Error(
        `Failed to register superuser via request (status ${status_code})`,
      );
    });
}
