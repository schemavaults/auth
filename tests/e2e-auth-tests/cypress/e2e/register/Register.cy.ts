describe("Register", () => {
  it("can load the register page", () => {
    cy.visit("/auth/register");
    cy.url().should("include", "/auth/register");
  });
});
