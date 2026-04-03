describe("API Servers", () => {
  describe("Unauthenticated Access", () => {
    it("unauthenticated users are redirected from the API servers admin page", () => {
      cy.visit("/admin/apis");
      cy.url().should("include", "/login");
    });
  });

  describe("Admin API Server Management", () => {
    it("admin can view API servers page", () => {
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.visit("/admin/apis");
        cy.url().should("include", "/admin/apis");
        cy.get("button#open-create-api-server-dialog-button").should("exist");
      });
    });

    it("admin can create API server from admin page", () => {
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(8).then((randomCode: string) => {
          const api_server_name = `Test API ${randomCode}`;
          const api_server_description = `E2E test API server ${randomCode}`;

          cy.create_api_server({
            api_server_name,
            api_server_description,
          }).then(({ success }) => {
            if (!success) {
              throw new Error(
                "Cypress 'create_api_server' command does not appear to have been a success",
              );
            }
            cy.log(`Successfully created API server '${api_server_name}'`);
          });
        });
      });
    });
  });

  describe("Organization API Server Creation", () => {
    it("admin can create API server from organization page", () => {
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

            cy.generate_random_code(8).then((apiCode: string) => {
              const api_server_name = `Org API ${apiCode}`;
              const api_server_description = `E2E test org API ${apiCode}`;

              cy.create_api_server({
                api_server_name,
                api_server_description,
                organization_id,
              }).then(({ success }) => {
                if (!success) {
                  throw new Error(
                    "Cypress 'create_api_server' command does not appear to have been a success",
                  );
                }

                cy.log(
                  `Successfully created API server '${api_server_name}' for organization '${organization_id}'`,
                );

                // Cleanup - deleting the org will cascade delete the API server
                cy.delete_organization({ organization_id });
              });
            });
          });
        });
      });
    });
  });
});
