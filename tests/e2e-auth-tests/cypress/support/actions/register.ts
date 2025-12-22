export default function register(
  email: string,
  password: string,
  invite_code?: string,
): Cypress.Chainable<number> {
  cy.intercept("POST", "**/api/auth/register").as("registerRequest");
  cy.intercept("POST", "**/api/token/authorization_code").as(
    "exchangeTokenRequest",
  );
  cy.intercept("GET", "**/account**").as("loadAccountPage");

  cy.visit("/auth/register");
  cy.wait(1250, { log: false });
  cy.log(`Attempting to register as user: '${email}'`);
  cy.url({ log: false }).should("include", "/auth/register");

  cy.get("input[name='email']", { log: false }).then(($input) => {
    if ($input.is(":disabled")) {
      cy.log("Email input is disabled, waiting a few seconds...");
      cy.wait(3000, { log: false });
    } else {
      cy.log("Email input does not appear to be disabled...");
    }
  });

  cy.get("input[name='email']", { log: false })
    .should("exist")
    .should("not.be.disabled")
    .type(email, { force: true });
  cy.get("input[name='password']", { log: false })
    .should("exist")
    .should("not.be.disabled")
    .type(password, { force: true });
  cy.get("input[name='confirm']", { log: false })
    .should("exist")
    .should("not.be.disabled")
    .type(password, { force: true });
  if (invite_code) {
    cy.get("input[name='invite_code']", { log: false })
      .should("not.be.disabled")
      .type(invite_code, { force: true });
  }
  cy.get("button[type='submit']")
    .should("exist")
    .should("not.be.disabled")
    .click();

  cy.log("Submitted register form");

  const register_result: Cypress.Chainable<JQuery<number>> = cy
    .wait("@registerRequest", { timeout: 10000 })
    .then((register_interception): Cypress.Chainable<JQuery<number>> => {
      cy.log(
        `Register API response status: ${register_interception.response?.statusCode}`,
      );
      if (register_interception.response?.statusCode === 200) {
        cy.log("Register request succeeded");
        return cy
          .wait("@exchangeTokenRequest", { timeout: 10000 })
          .then((exchange_tokens_interception) => {
            if (exchange_tokens_interception.response?.statusCode === 200) {
              cy.log("Exchange token request succeeded");
              return cy
                .wait("@loadAccountPage", {
                  timeout: 20000,
                  requestTimeout: 20000,
                })
                .then((account_interception) => {
                  const statusCode: number =
                    account_interception.response?.statusCode ?? 500;
                  if (statusCode < 400) {
                    cy.log("Account page loaded successfully");
                    return cy.wait(7500).then(() => {
                      cy.url({ timeout: 10000 }).should("include", "/account");
                      // Wait for page to be interactive
                      cy.get("body", { timeout: 10000 }).should("be.visible");
                      return cy.wrap(200, { log: false });
                    });
                  } else {
                    cy.log(
                      "Failed to load account page with status code: " +
                        statusCode,
                    );
                    return cy.wrap(statusCode, { log: false });
                  }
                });
            } else {
              cy.log(
                `Exchange token request failed with status ${exchange_tokens_interception.response?.statusCode} ${exchange_tokens_interception.response?.statusMessage}`,
              );
              return cy.wrap(
                exchange_tokens_interception.response?.statusCode ?? 500,
                { log: false },
              );
            }
          });
      } else {
        cy.log(
          `Register request failed with status ${register_interception.response?.statusCode} ${register_interception.response?.statusMessage}`,
        );
        return cy.wrap(register_interception.response?.statusCode ?? 500, {
          log: false,
        });
      }
    });

  return register_result.then((res: JQuery<number>) => {
    const val: number = res[0];
    return val;
  });
}
