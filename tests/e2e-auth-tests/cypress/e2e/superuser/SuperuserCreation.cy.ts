describe("Superuser Creation", () => {
  it("can create or login as the superuser", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create/login as superuser");
      }

      // Make sure we end up on the account page
      cy.log("Superuser created or logged in");
      cy.url().should("include", "/account");

      // go to the admin dashboard
      cy.visit("/admin");
      cy.url().should("include", "/admin");
    });
  });

  it("can go to the admin page from a link on the account page", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create/login as superuser");
      }

      cy.log("Superuser created or logged in");
      cy.url().should("include", "/account");

      // Go to the admin page after
      cy.get("#view-admin-dashboard-link").should("exist").click();
      cy.url().should("include", "/admin");
    });
  });

  it("superuser invite code cannot be used multiple times", () => {
    // First, ensure superuser is created (which uses the invite code)
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create/login as superuser");
      }

      cy.log("Superuser created or logged in, now logging out...");
      cy.logout();

      // Now attempt to register a different user with the same superuser invite code
      const invite_code: string | undefined = Cypress.env(
        "PRIVATE_SUPERUSER_INVITE_CODE",
      );
      if (!invite_code) {
        throw new Error(
          "PRIVATE_SUPERUSER_INVITE_CODE environment variable is not set",
        );
      }

      cy.generate_random_code(12).then((random_suffix: string) => {
        const new_user_email = `test-reuse-invite-${random_suffix}@example.com`;
        const new_user_password = "TestPassword123!";

        cy.log(
          `Attempting to register new user '${new_user_email}' with already-used superuser invite code...`,
        );

        cy.register(new_user_email, new_user_password, invite_code).then(
          (status_code: number) => {
            cy.log(`Registration returned status code: ${status_code}`);
            // Registration should fail - the invite code should already be used
            expect(status_code).to.not.equal(200);
            cy.log(
              "Registration correctly failed - superuser invite code cannot be reused",
            );
          },
        );
      });
    });
  });
});
