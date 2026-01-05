describe("Logout", () => {
  it("is redirected from the logout page to the login page when not logged in", () => {
    cy.visit("/auth/logout");
    cy.url().should("include", "/auth/login");
  });

  it("can logout from the superuser account from the sign out button on account page", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }
    });

    // We should now be logged in (as superuser) on the account page
    cy.getCookie("refresh_token").should("exist");
    cy.url().should("include", "/account");

    // Perform logout
    cy.logout().then(() => {
      cy.wait(5000).then(() => {
        // Post-logout assertions
        cy.url({ timeout: 10000 }).should("include", "/auth/login");
        cy.getCookie("refresh_token").should("not.exist");
      });
    });
  });
});
