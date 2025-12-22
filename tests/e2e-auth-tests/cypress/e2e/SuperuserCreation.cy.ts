describe("Superuser Creation", () => {
  it("can create or login as the superuser", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create/login as superuser");
      }

      cy.log("Superuser created or logged in");
      cy.wait(4000).then(() => {
        cy.url().should("include", "/account");

        // Go to the admin page after
        cy.visit("/admin");
        cy.wait(3000);
        cy.url().should("include", "/admin");
      });
    });
  });

  it("can go to the admin page from a link on the account page", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create/login as superuser");
      }

      cy.log("Superuser created or logged in");
      cy.wait(4000).then(() => {
        cy.url().should("include", "/account");

        // Go to the admin page after
        cy.get("#view-admin-dashboard-link").should("exist").click();
        cy.url().should("include", "/admin");
      });
    });
  });
});
