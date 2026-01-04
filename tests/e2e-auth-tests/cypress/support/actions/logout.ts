export default function logout() {
  // Go to the account page
  cy.visit("/account");

  // Pre-logout assertions
  cy.url().should("include", "/account").should("not.include", "/auth/login");
  cy.getCookie("refresh_token").should("exist");

  // Perform logout actions
  cy.get("button#sign-out-button").click();

  // Post-logout assertions
  cy.wait(1500).then(() => {
    cy.url().should("not.include", "/account").should("include", "/auth/login");
    cy.getCookie("refresh_token").should("not.exist");
  });
}
