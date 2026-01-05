export default function logout() {
  // Go to the account page
  cy.visit("/account");

  // Pre-logout assertions
  cy.url().should("include", "/account").should("not.include", "/auth/login");
  cy.getCookie("refresh_token").should("exist");

  // Perform logout actions
  cy.get("button#sign-out-button").click();

  // Post-logout triggered assertions
  return cy.wait(3000).then(() => {
    cy.url().should("not.include", "/account");

    // Post successful logout assertions
    return cy.wait(6500).then(() => {
      cy.getCookie("refresh_token").should("not.exist");
      cy.url({ timeout: 20000 }).should("not.include", "/auth/logout");
    });
  });
}
