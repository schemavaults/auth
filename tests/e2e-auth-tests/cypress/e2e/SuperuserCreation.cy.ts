describe("Superuser Creation", () => {
  it("can create or login as the superuser", () => {
    cy.create_and_login_as_superuser().then(() => {
      cy.log("Superuser created or logged in");
      cy.wait(4000);
      cy.url().should("include", "/account");

      cy.visit("/admin");
      cy.wait(3000);
      cy.url().should("include", "/admin");
    });
  });
});
