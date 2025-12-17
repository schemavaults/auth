describe("Unauthenticated Redirects", () => {
  it("is redirected off the account page", () => {
    cy.visit("/account");
    cy.wait(400);
    cy.url().should("not.include", "/account");
  });

  it("is redirected off the admin page", () => {
    cy.visit("/admin");
    cy.wait(400);
    cy.url().should("not.include", "/admin");
  });
});
