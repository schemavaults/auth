export default function logout() {
  // Go to the account page
  cy.visit("/account");

  // Pre-logout assertions
  cy.url().should("include", "/account").should("not.include", "/auth/login");
  cy.getCookie("refresh_token").should("exist");

  // Perform logout actions
  cy.intercept("POST", "**/api/logout").as("logoutRequest");
  cy.intercept("GET", "**/auth/login?**").as("loginPageLoad");
  cy.get("button#sign-out-button").click();

  // Post-logout triggered assertions
  cy.wait(2000).then(() => {
    cy.url().should("not.include", "/account");

    cy.wait("@logoutRequest", { timeout: 15000 }).then((interception) => {
      cy.wrap(interception.response?.statusCode).should("eq", 200);
      // refresh token should have been cleared by logout request
      cy.getCookie("refresh_token").should("not.exist");
      cy.log("Logout request appears to have been a success!");

      // Now, make sure that user is sent to login page
      cy.wait("@loginPageLoad", { timeout: 15000 }).then(() => {
        // Post successful logout assertions
        cy.wait(5000).then(() => {
          cy.url({ timeout: 20000 }).should("not.include", "/auth/logout");
        });
      });
    });
    return;
  });
}
