describe("Organizations", () => {
  describe("Unauthenticated Access", () => {
    it("unauthenticated users are redirected from the organizations admin page", () => {
      cy.visit("/admin/organizations");
      cy.wait(1000);
      cy.url().should("include", "/login");
    });

    it("unauthenticated users are redirected from organization pages", () => {
      cy.visit("/org/test-organization");
      cy.wait(1000);
      cy.url().should("include", "/login");
    });
  });

  describe("Admin Organization Management", () => {
    it("admin can view organizations page", () => {
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.visit("/admin/organizations");
        cy.url().should("include", "/admin/organizations");
        cy.get("button#open-create-organization-dialog-button").should("exist");
      });
    });

    it("admin can create organization and visit its page", () => {
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(12).then((randomCode: string) => {
          const organization_id = `test-org-${randomCode.toLowerCase()}`;
          const name = `Test Organization ${randomCode}`;

          cy.create_organization({ organization_id, name }).then(() => {
            cy.log(
              `Successfully created organization '${organization_id}' with name '${name}'`,
            );

            // Visit the organization page
            cy.visit(`/org/${organization_id}`);
            cy.url().should("include", `/org/${organization_id}`);

            // Verify the org page loads correctly (not redirected to error)
            cy.url().should("not.include", "/error");
            cy.contains(name).should("exist");
          });
        });
      });
    });
  });

  describe("Non-Member Access Restrictions", () => {
    it("non-member regular user is redirected with 403 forbidden", () => {
      // First, create an organization as admin
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(12).then((randomCode: string) => {
          const organization_id: string = `restricted-org-${randomCode.toLowerCase()}`;
          const name: string = `Restricted Organization ${randomCode}`;

          cy.create_organization({ organization_id, name }).then(() => {
            cy.log(
              `Created restricted organization '${organization_id}' as admin`,
            );

            // Logout the admin
            cy.logout();

            // Login as a regular user (non-member)
            cy.generate_random_test_user_credentials().then((credentials) => {
              cy.create_and_login_as_regular_user(credentials).then(() => {
                // Attempt to visit the organization page
                cy.visit(`/org/${organization_id}`, {
                  failOnStatusCode: false,
                });

                // Should be redirected to error page with 403 forbidden
                cy.url().should("include", "/error");
                cy.url().should("include", "error=403");
                cy.url().should("include", "error_id=forbidden");
              });
            });
          });
        });
      });
    });
  });
});
