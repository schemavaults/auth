describe("Unauthenticated Redirects", () => {
  it("is redirected off the account page", () => {
    cy.visit("/account");
    cy.url().should("not.include", "/account");
  });

  it("is redirected off the admin page", () => {
    cy.visit("/admin");
    cy.url().should("not.include", "/admin");
  });
});
