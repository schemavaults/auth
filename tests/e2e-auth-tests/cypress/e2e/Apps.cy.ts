describe("Apps", () => {
  describe("Unauthenticated Access", () => {
    it("unauthenticated users are redirected from the apps admin page", () => {
      cy.visit("/admin/apps");
      cy.wait(1000);
      cy.url().should("include", "/login");
    });
  });

  describe("Admin Apps Management", () => {
    it("admin can view apps page", () => {
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.visit("/admin/apps");
        cy.url().should("include", "/admin/apps");
        cy.get("button#open-create-app-dialog-button").should("exist");
      });
    });

    it("admin can create app from admin page", () => {
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(8).then((randomCode: string) => {
          const app_name: string = `Test App ${randomCode}`;
          const app_description: string = `E2E test app ${randomCode}`;

          cy.create_app({ app_name, app_description }).then(
            (success: boolean) => {
              if (typeof success !== "boolean" || !success) {
                throw new Error(
                  "Cypress 'create_app' command does not appear to have been a success",
                );
              }
              cy.log(`Successfully created app '${app_name}'`);
            },
          );
        });
      });
    });
  });

  describe("Regular User Access Restrictions", () => {
    it("non-admin users are redirected from admin apps page with 403 forbidden", () => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user(credentials).then(() => {
          cy.visit("/admin/apps", { failOnStatusCode: false });
          cy.url().should("include", "/error");
          cy.url().should("include", "error=403");
        });
      });
    });
  });

  describe("Organization App Creation", () => {
    it("admin can create app from organization page", () => {
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(12).then((orgCode: string) => {
          const organization_id = `test-org-${orgCode.toLowerCase()}`;
          const name = `Test Org ${orgCode}`;

          cy.create_organization({ organization_id, name }).then(() => {
            cy.log(
              `Successfully created organization '${organization_id}' with name '${name}'`,
            );

            cy.generate_random_code(8).then((appCode: string) => {
              const app_name: string = `Org App ${appCode}`;
              const app_description: string = `E2E test org app ${appCode}`;

              cy.create_app({
                app_name,
                app_description,
                organization_id,
              }).then((success: boolean) => {
                if (typeof success !== "boolean" || !success) {
                  throw new Error(
                    "Cypress 'create_app' command does not appear to have been a success",
                  );
                }

                cy.log(
                  `Successfully created app '${app_name}' for organization '${organization_id}'`,
                );
              });
            });
          });
        });
      });
    });
  });
});
