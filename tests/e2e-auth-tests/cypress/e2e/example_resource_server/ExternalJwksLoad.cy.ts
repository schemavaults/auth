describe("External JWKS Load", () => {
  describe("Authenticated JWKS Access", () => {
    it("external resource server can load JWKS with valid access token", () => {
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(8).then((code: string) => {
          const api_server_name = `Test JWKS API ${code}`;
          const api_server_description = `E2E test for JWKS access ${code}`;

          cy.create_api_server({
            api_server_name,
            api_server_description,
          }).then(({ success, api_server_id }) => {
            if (!success || !api_server_id) {
              throw new Error("Failed to create API server");
            }

            cy.log(`Created API server with ID: ${api_server_id}`);

            cy.generate_jwks_access_key(api_server_id).then(
              ({ success, private_key }) => {
                if (!success || !private_key) {
                  throw new Error("Failed to generate JWKS access key");
                }

                cy.log("Generated JWKS access key successfully");

                cy.task("createJwksAccessProofToken", {
                  api_server_id,
                  private_key_pem: private_key,
                }).then((token) => {
                  if (typeof token !== "string") {
                    throw new TypeError(
                      "Expected result of createJwksAccessProofToken task to be a string!",
                    );
                  }
                  cy.log(`Created JWKS Access Proof Token: ${token}`);

                  cy.request({
                    method: "GET",
                    url: `/api/jwks/${api_server_id}`,
                    headers: {
                      Authorization: `Bearer ${token satisfies string}`,
                    },
                  }).then((response) => {
                    expect(response.status).to.eq(200);
                    expect(response.body).to.have.property("keys");
                    expect(response.body.keys).to.be.an("array");
                    expect(response.body.keys.length).to.be.greaterThan(0);

                    // Verify JWKS structure
                    for (const key of response.body.keys) {
                      expect(typeof key === "object", "Each JWKS key should be an object").to.be.true;
                      expect(key).to.have.property("kty");
                      expect(key).to.have.property("kid");
                      expect(key).to.have.property("alg");
                    }
                  });
                });
              },
            );
          });
        });
      });
    });
  });

  describe("Unauthorized JWKS Access", () => {
    it("returns 401 without Authorization header", () => {
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(8).then((code: string) => {
          const api_server_name = `Test JWKS Unauth ${code}`;
          const api_server_description = `E2E test for unauthorized JWKS access ${code}`;

          cy.create_api_server({
            api_server_name,
            api_server_description,
          }).then(({ success, api_server_id }) => {
            if (!success || !api_server_id) {
              throw new Error("Failed to create API server");
            }

            // Generate the key so the endpoint is properly set up
            cy.generate_jwks_access_key(api_server_id).then(({ success }) => {
              if (!success) {
                throw new Error("Failed to generate JWKS access key");
              }

              // Request without Authorization header
              cy.request({
                method: "GET",
                url: `/api/jwks/${api_server_id}`,
                failOnStatusCode: false,
              }).then((response) => {
                expect(response.status).to.eq(401);
              });
            });
          });
        });
      });
    });

    it("returns 401 with invalid Bearer token", () => {
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(8).then((code: string) => {
          const api_server_name = `Test JWKS Invalid ${code}`;
          const api_server_description = `E2E test for invalid token JWKS access ${code}`;

          cy.create_api_server({
            api_server_name,
            api_server_description,
          }).then(({ success, api_server_id }) => {
            if (!success || !api_server_id) {
              throw new Error("Failed to create API server");
            }

            // Generate the key so the endpoint is properly set up
            cy.generate_jwks_access_key(api_server_id).then(({ success }) => {
              if (!success) {
                throw new Error("Failed to generate JWKS access key");
              }

              // Request with malformed Bearer token
              cy.request({
                method: "GET",
                url: `/api/jwks/${api_server_id}`,
                headers: {
                  Authorization: "Bearer invalid.malformed.token",
                },
                failOnStatusCode: false,
              }).then((response) => {
                expect(response.status).to.eq(401);
              });
            });
          });
        });
      });
    });

    it("returns 400 for invalid api_server_id format", () => {
      // Test with an invalid api_server_id format (contains invalid characters)
      cy.request({
        method: "GET",
        url: `/api/jwks/invalid!!api!!id`,
        headers: {
          Authorization: "Bearer some.token.here",
        },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
      });
    });
  });
});
