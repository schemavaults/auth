// crypto.randomUUID() is unavailable in the spec's browser context (the
// auth server is not served from a secure context in CI), so derive test
// jtis from the clock + Math.random instead.
function freshJti(): string {
  return `e2e-jti-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Complete claim set matching what createJwksAccessProofToken emits; the
// hardened-validation tests remove or corrupt one claim at a time. The `aud`
// claim carries the auth server URL (resolved in cypress.config.ts, since
// getAuthServerUrl() cannot run in the browser context).
function baselineAssertionClaims(
  api_server_id: string,
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    api_server_id,
    sub: api_server_id,
    iss: api_server_id,
    aud: Cypress.env("AUTH_SERVER_URL"),
    iat: now,
    nbf: now - 1,
    exp: now + 60,
    jti: freshJti(),
  };
}

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

  describe("Hardened Assertion Validation", () => {
    let api_server_id: string;
    let private_key: string;

    // The assertions under test are sent via cy.request (no browser
    // session needed), so one API server + access key can be shared by
    // every test in this block.
    before(() => {
      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }

        cy.generate_random_code(8).then((code: string) => {
          cy.create_api_server({
            api_server_name: `Test JWKS Hardening ${code}`,
            api_server_description: `E2E test for hardened JWKS assertion validation ${code}`,
          }).then(({ success, api_server_id: created_api_server_id }) => {
            if (!success || !created_api_server_id) {
              throw new Error("Failed to create API server");
            }
            api_server_id = created_api_server_id;

            cy.generate_jwks_access_key(api_server_id).then(
              ({ success, private_key: generated_private_key }) => {
                if (!success || !generated_private_key) {
                  throw new Error("Failed to generate JWKS access key");
                }
                private_key = generated_private_key;
              },
            );
          });
        });
      });
    });

    function requestJwks(token: string): Cypress.Chainable<Cypress.Response<unknown>> {
      return cy.request({
        method: "GET",
        url: `/api/jwks/${api_server_id}`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        failOnStatusCode: false,
      });
    }

    function expect401ForClaims(claims: Record<string, unknown>): void {
      cy.task("signCustomJwksAccessAssertion", {
        private_key_pem: private_key,
        claims,
      }).then((token) => {
        if (typeof token !== "string") {
          throw new TypeError(
            "Expected result of signCustomJwksAccessAssertion task to be a string!",
          );
        }
        requestJwks(token).then((response) => {
          expect(response.status).to.eq(401);
        });
      });
    }

    it("returns 401 when a previously-used assertion is replayed", () => {
      cy.task("createJwksAccessProofToken", {
        api_server_id,
        private_key_pem: private_key,
      }).then((token) => {
        if (typeof token !== "string") {
          throw new TypeError(
            "Expected result of createJwksAccessProofToken task to be a string!",
          );
        }

        requestJwks(token).then((first) => {
          expect(first.status, "first use of the assertion").to.eq(200);

          requestJwks(token).then((second) => {
            expect(second.status, "replay of the same assertion").to.eq(401);
          });
        });
      });
    });

    it("returns 401 for an assertion missing the exp claim", () => {
      const claims = baselineAssertionClaims(api_server_id);
      delete claims.exp;
      expect401ForClaims(claims);
    });

    it("returns 401 for an expired assertion", () => {
      const now = Math.floor(Date.now() / 1000);
      expect401ForClaims({
        ...baselineAssertionClaims(api_server_id),
        iat: now - 120,
        nbf: now - 120,
        exp: now - 60,
      });
    });

    it("returns 401 for an assertion with a mismatched aud claim", () => {
      expect401ForClaims({
        ...baselineAssertionClaims(api_server_id),
        aud: "not-the-schemavaults-auth-server",
      });
    });

    it("returns 401 for an assertion with a mismatched iss claim", () => {
      expect401ForClaims({
        ...baselineAssertionClaims(api_server_id),
        iss: "00000000-1111-2222-3333-444444444444",
      });
    });
  });
});
