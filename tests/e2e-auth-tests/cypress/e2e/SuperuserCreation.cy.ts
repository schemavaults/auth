describe("Superuser Creation", () => {
  it("can create or login as the superuser", () => {
    cy.create_and_login_as_superuser().then(() => {
      cy.log("Superuser created or logged in");

      cy.wait(5000);

      cy.visit("/admin");

      cy.url().should("include", "/admin");
    });
  });
});
