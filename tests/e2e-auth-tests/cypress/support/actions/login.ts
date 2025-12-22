export default function login(email: string, password: string) {
  cy.intercept("POST", "**/api/auth/login").as("loginRequest");
  cy.intercept("POST", "**/api/token/authorization_code").as(
    "exchangeTokenRequest",
  );

  // Go to
  cy.visit("/auth/login");
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
  cy.wait("@loginRequest", { timeout: 10000 }).then((interception) => {
    cy.log(`Login API response status: ${interception.response?.statusCode}`);
    if (interception.response?.statusCode === 200) {
      cy.log("Login request succeeded");
      cy.wait("@exchangeTokenRequest", { timeout: 10000 }).then(
        (interception) => {
          cy.log(
            `Exchange token API response status: ${interception.response?.statusCode}`,
          );
          if (interception.response?.statusCode === 200) {
            cy.log("Exchange token request succeeded");
          } else {
            cy.log(
              `Exchange token request failed with status ${interception.response?.statusCode} ${interception.response?.statusMessage}`,
            );
          }
        },
      );
    } else {
      cy.log(
        `Login request failed with status ${interception.response?.statusCode} ${interception.response?.statusMessage}`,
      );
    }
  });

  // we don't make any assumptions about whether login should have succeeded or failed
}
