export default function login(
  email: string,
  password: string,
): Cypress.Chainable<boolean> {
  cy.is_authenticated().should('be.false');

  cy.intercept("POST", "**/api/auth/login").as("loginRequest");
  cy.intercept("POST", "**/api/token/authorization_code").as(
    "exchangeTokenRequest",
  );
  cy.intercept("GET", "**/account**").as("loadAccountPage");

  // Go to
  cy.visit("/auth/login");
  cy.wait(1250, { log: false });
  cy.log(`Attempting to login as user: '${email}'`);
  cy.url({ log: false }).should("include", "/auth/login");

  cy.get("input[name='email']", { log: false, timeout: 10000 }).then(
    ($input) => {
      if ($input.is(":disabled")) {
        cy.log("Email input is disabled, waiting a few seconds...");
        cy.wait(3000, { log: false });
      } else {
        cy.log("Email input does not appear to be disabled...");
      }
    },
  );

  cy.get("input[name='email']", { log: false })
    .should("exist")
    .should("not.be.disabled")
    .type(email, { force: true });
  cy.get("input[name='password']", { log: false })
    .should("exist")
    .should("not.be.disabled")
    .type(password, { force: true });
  cy.get("button[type='submit']", { log: false })
    .should("exist")
    .should("not.be.disabled")
    .click();

  cy.log("Submitted login form");

  // Wait for the actual API request to complete
  const submit_result: Cypress.Chainable<boolean> = cy
    .wait("@loginRequest", { timeout: 10000 })
    .then((login_interception): Cypress.Chainable<JQuery<boolean>> => {
      cy.log(
        `Login API response status: ${login_interception.response?.statusCode}`,
      );
      if (login_interception.response?.statusCode === 200) {
        cy.log("Login request succeeded");
        return cy
          .wait("@exchangeTokenRequest", { timeout: 10000 })
          .then((interception) => {
            cy.log(
              `Exchange token API response status: ${interception.response?.statusCode}`,
            );
            if (interception.response?.statusCode === 200) {
              cy.log("Exchange token request succeeded");
              cy.getCookie("refresh_token").should("exist");
              cy.getCookie("refresh_token_expiry").should("exist");
              return cy
                .wait("@loadAccountPage", {
                  timeout: 20000,
                  requestTimeout: 20000,
                })
                .then((account_interception) => {
                  const statusCode: number =
                    account_interception.response?.statusCode ?? 500;
                  if (statusCode < 400) {
                    cy.log(
                      "Loaded data for /account route (not necessarily navigated yet though)",
                    );

                    cy.has_error_toast();

                    return cy.wait(4000).then(() => {
                      cy.url({ timeout: 10000 }).should("include", "/account");
                      // Wait for page to be interactive
                      cy.get("body", { timeout: 10000 }).should("be.visible");
                      cy.log("Account page loaded successfully");
                      cy.is_authenticated().should("equal", true);
                      return cy.wrap(true, { log: false });
                    });
                  } else {
                    cy.log(
                      "Failed to load account page. Status Code: " + statusCode,
                    );
                    return cy.wrap(false, { log: false });
                  }
                });
            } else {
              cy.log(
                `Exchange token request failed with status ${interception.response?.statusCode} ${interception.response?.statusMessage}`,
              );
              return cy.wrap(false, { log: false });
            }
          });
      } else {
        cy.log(
          `Login request failed with status ${login_interception.response?.statusCode} ${login_interception.response?.statusMessage}`,
        );
        return cy.wrap(false, { log: false });
      }
    })
    .then((res) => {
      const val: boolean = res[0];
      return val;
    });

  return submit_result;
}
