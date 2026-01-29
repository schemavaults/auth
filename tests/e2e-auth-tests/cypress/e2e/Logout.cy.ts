describe("Logout", () => {
  it("is redirected from the logout page to the login page (or home page) when not logged in", () => {
    cy.visit("/auth/logout");
    cy.url().should((value: string): boolean => {
      if (value.includes("/auth/logout")) {
        return false;
      }

      function isHomepage() {
        return (
          value === process.env.CYPRESS_BASE_URL ||
          `${value === process.env.CYPRESS_BASE_URL}/`
        );
      }

      if (
        isHomepage() ||
        value.includes("/auth/login") ||
        value.includes("/welcome") ||
        value.includes("/about")
      ) {
        return true;
      }
      return false;
    });
  });

  it("can logout from the superuser account from the sign out button on account page", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }

      cy.url().should("include", "/account");

      // We should now be logged in (as superuser) on the account page
      cy.getCookie("refresh_token").should("exist");
      cy.getCookie("refresh_token_expiry").should("exist");

      // Perform logout
      cy.logout().then(() => {
        cy.getCookie("refresh_token").should("not.exist");
        cy.getCookie("refresh_token_expiry").should("not.exist");
      });
    });
  });
});
