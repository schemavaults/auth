describe("Superuser Creation", () => {
  it("can create or login as the superuser", () => {
    cy.create_and_login_as_superuser().then(() => {
      cy.visit("/admin");

      cy.url().should("include", "/admin");
    });
  });
});
