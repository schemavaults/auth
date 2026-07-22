describe("API Servers", () => {
  describe("Unauthenticated Access", () => {
    it("unauthenticated users are redirected from the API servers admin page", () => {
      cy.visit("/admin/apis");
      cy.url().should("include", "/login");
    });
  });

  describe("Admin API Server Management", () => {
    it("admin can view API servers page", () => {
      cy.create_and_login_as_superuser_via_request().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.visit("/admin/apis");
        cy.url().should("include", "/admin/apis");
        cy.get("button#open-create-api-server-dialog-button").should("exist");
      });
    });

    it("admin can create API server from admin page", () => {
      cy.create_and_login_as_superuser_via_request().then((success) => {
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

    it("admin can create API server with a custom api server id", () => {
      cy.create_and_login_as_superuser_via_request().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(8).then((randomCode: string) => {
          const api_server_id = `custom-api-${randomCode.toLowerCase()}`;
          const api_server_name = `Custom ID API ${randomCode}`;
          const api_server_description = `E2E test API server with custom id ${randomCode}`;

          cy.create_api_server({
            api_server_name,
            api_server_description,
            api_server_id,
          }).then((result) => {
            if (!result.success) {
              throw new Error(
                "Cypress 'create_api_server' command does not appear to have been a success",
              );
            }
            cy.wrap(result.api_server_id).should(
              "eq",
              api_server_id,
              "Created API server should use the custom api server id",
            );
            cy.log(
              `Successfully created API server with custom id '${api_server_id}'`,
            );
          });
        });
      });
    });
  });

  describe("API Server Domain Management", () => {
    // crypto.randomUUID() is unavailable in the spec's browser context (the
    // auth server is not served from a secure context in CI). Generate an
    // RFC4122 v4 UUID with Math.random instead — the id feeds into a
    // `z.string().uuid()` validator on the auth-server.
    function generateV4Uuid(): string {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

    it("admin can add a domain to an API server from the admin page", () => {
      cy.create_and_login_as_superuser_via_request().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(8).then((randomCode: string) => {
          const api_server_name = `Domain Test API ${randomCode}`;
          const api_server_description = `E2E test API server for domain management ${randomCode}`;
          const domain = `https://api-${randomCode.toLowerCase()}.example.test`;

          cy.create_api_server({
            api_server_name,
            api_server_description,
          }).then((result) => {
            if (!result.success || !result.api_server_id) {
              throw new Error(
                "Cypress 'create_api_server' command does not appear to have been a success",
              );
            }
            const api_server_id: string = result.api_server_id;

            cy.visit("/admin/apis");
            cy.wait_for_page_hydration();

            // Narrow the table down to the API server created above
            cy.get('input[placeholder="Filter servers..."]')
              .should("exist")
              .type(api_server_name);

            cy.contains("tr", api_server_name)
              .should("exist")
              .within(() => {
                cy.get('[data-testid="api-server-actions-button"]').click();
              });

            // The dropdown menu renders in a portal outside the table row.
            // First confirm the menu opened at all via an item that is not
            // permission-gated...
            cy.contains('[role="menuitem"]', "View API details", {
              timeout: 10000,
            }).should("be.visible");

            // ...then wait for the admin-gated "Add domain" item. It is
            // gated on useAdmin(), i.e. the auth client's in-memory user,
            // which restores asynchronously after the cookie-only
            // login-via-request — the open menu re-renders once the client
            // finishes restoring the admin session, so retry generously.
            cy.contains('[role="menuitem"]', "Add domain", {
              timeout: 20000,
            })
              .should("be.visible")
              .click();

            cy.get("#create-api-server-domain-dialog-content").should("exist");

            cy.get('input[name="domain"]')
              .should("be.visible")
              .should("not.be.disabled")
              .type(domain);

            // Validate the input before submission (guards against dropped
            // keystrokes regressions; the form mounts fresh per dialog open
            // so typing must not race a post-open re-render)
            cy.get('input[name="domain"]').should("have.value", domain);

            cy.get("#api-server-domain-environment-radio-item-test").click();

            cy.intercept({
              method: "POST",
              url: "**/api/apis/*/domains",
              times: 1,
            }).as("createApiServerDomainRequest");

            cy.get("button#submit-create-api-server-domain-form-button")
              .should("exist")
              .should("not.be.disabled")
              .click();

            cy.wait("@createApiServerDomainRequest", {
              timeout: 20000,
              requestTimeout: 20000,
            }).then((interception) => {
              cy.wrap(interception.response?.statusCode).should(
                "eq",
                200,
                "Create API server domain request should return 200",
              );
            });

            cy.get("#create-api-server-domain-dialog-content").should(
              "not.exist",
            );

            // The Domains column revalidates via SWR and should now show
            // the newly registered domain in the API server's row
            cy.contains("tr", api_server_name).should("contain.text", domain);

            // The list endpoint should also return the created domain
            cy.request(`/api/apis/${api_server_id}/domains`).then(
              (listResponse) => {
                expect(listResponse.status).to.eq(200);
                expect(listResponse.body).to.have.property("success", true);
                const domains = listResponse.body.list as Array<{
                  domain: string;
                  environment: string;
                }>;
                expect(
                  domains.some(
                    (d) => d.domain === domain && d.environment === "test",
                  ),
                  "created domain should be present in the list response",
                ).to.be.true;
              },
            );
          });
        });
      });
    });

    it("admin can add and list an API server domain via the HTTP API", () => {
      cy.create_and_login_as_superuser_via_request().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(8).then((randomCode: string) => {
          const api_server_name = `Domain API Test ${randomCode}`;
          const api_server_description = `E2E test API server for domain HTTP API test ${randomCode}`;
          const domain = `https://api-http-${randomCode.toLowerCase()}.example.test`;

          cy.create_api_server({
            api_server_name,
            api_server_description,
          }).then((result) => {
            if (!result.success || !result.api_server_id) {
              throw new Error(
                "Cypress 'create_api_server' command does not appear to have been a success",
              );
            }
            const api_server_id: string = result.api_server_id;
            const api_server_domain_ref_id: string = generateV4Uuid();

            cy.request({
              method: "POST",
              url: `/api/apis/${api_server_id}/domains`,
              body: {
                api_server_domain_ref_id,
                api_server_id,
                domain,
                environment: "test",
                created_at: Date.now(),
                hardcoded: false,
              },
            }).then((createResponse) => {
              expect(createResponse.status).to.eq(200);
              expect(createResponse.body).to.have.property("success", true);

              cy.request(`/api/apis/${api_server_id}/domains`).then(
                (listResponse) => {
                  expect(listResponse.status).to.eq(200);
                  expect(listResponse.body).to.have.property("success", true);
                  const domains = listResponse.body.list as Array<{
                    api_server_domain_ref_id: string;
                    domain: string;
                    environment: string;
                  }>;
                  const created = domains.find(
                    (d) =>
                      d.api_server_domain_ref_id === api_server_domain_ref_id,
                  );
                  expect(
                    created,
                    "created domain should be returned by the list endpoint",
                  ).to.exist;
                  expect(created?.domain).to.eq(domain);
                  expect(created?.environment).to.eq("test");
                },
              );
            });
          });
        });
      });
    });
  });

  describe("Organization API Server Creation", () => {
    it("admin can create API server from organization page", () => {
      cy.create_and_login_as_superuser_via_request().then((success) => {
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
