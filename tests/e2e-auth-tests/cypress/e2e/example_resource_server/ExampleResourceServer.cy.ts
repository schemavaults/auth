describe("ExampleResourceServer", () => {
  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  // Normalize origin to strip default port 80 — cy.origin() requires
  // the argument to match the browser's normalised origin exactly.
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;

  it("can visit the example resource server", () => {
    cy.origin(exampleAppOrigin, () => {
      cy.visit("/");
      cy.url().should("include", "example-nextjs-resource-server");
      cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
    });
  });

  it("can register a new user through the full OAuth2 PKCE flow and access the protected /account route", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) {
            throw new Error("Failed to create invite code");
          }

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `pkce-reg-test-${suffix}@example.com`;
            const password = "TestPassword123!";

            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            });
          });
        });
      });
    });
  });

  it("can logout and then login via OAuth2 PKCE flow", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) {
            throw new Error("Failed to create invite code");
          }

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `pkce-login-test-${suffix}@example.com`;
            const password = "TestPassword123!";

            // Register the user first via the PKCE flow
            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              // Logout from the auth server
              cy.logout();

              // Login via the PKCE flow with the same credentials
              cy.login_via_resource_server_pkce_flow({
                resource_server_origin: exampleAppOrigin,
                email,
                password,
              });
            });
          });
        });
      });
    });
  });

  it("redirects an already-authenticated user to /account from /auth/login when already logged in", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) {
            throw new Error("Failed to create invite code");
          }

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `pkce-redirect-test-${suffix}@example.com`;
            const password = "TestPassword123!";

            // Register and authenticate via PKCE flow
            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              // User is now authenticated on the example resource server.
              // Visiting /auth/login should redirect to /account since
              // the auth middleware redirects authenticated users away
              // from unauthenticated-only routes.
              cy.origin(exampleAppOrigin, () => {
                cy.visit("/auth/login");
                cy.url({ timeout: 15000 }).should("include", "/account");
                cy.contains("Example Account Page", {
                  timeout: 15000,
                }).should("be.visible");
              });
            });
          });
        });
      });
    });
  });

  it("treats a user with expired access tokens but valid refresh tokens as still logged in on /auth/login", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) {
            throw new Error("Failed to create invite code");
          }

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `pkce-expired-access-test-${suffix}@example.com`;
            const password = "TestPassword123!";

            // Register and authenticate via PKCE flow
            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              // User is now authenticated on the example resource server.
              // Clear all access token cookies to simulate expired access tokens,
              // while keeping the refresh token in localStorage intact.
              cy.origin(exampleAppOrigin, () => {
                cy.getCookies().then((cookies) => {
                  for (const cookie of cookies) {
                    if (cookie.name.startsWith("access_token")) {
                      cy.clearCookie(cookie.name);
                    }
                  }
                });

                // Verify refresh token still exists in localStorage
                cy.window().then((win) => {
                  const keys = Object.keys(win.localStorage);
                  const hasRefreshToken = keys.some((k) =>
                    k.startsWith("refresh_token_"),
                  );
                  expect(hasRefreshToken).to.be.true;
                });

                // Intercept the refresh token exchange to verify new access
                // tokens are acquired from the auth server
                cy.intercept("POST", "**/api/auth/token/refresh_token/**").as(
                  "refreshTokenExchange",
                );

                cy.visit("/auth/login");

                // Should be redirected to /account since the middleware still
                // considers the user logged in (valid refresh token exists)
                cy.url({ timeout: 15000 }).should("include", "/account");
                cy.contains("Example Account Page", {
                  timeout: 15000,
                }).should("be.visible");

                // Verify that a refresh token exchange occurred, proving new
                // access tokens were generated to replace the expired ones
                cy.wait("@refreshTokenExchange").then((interception) => {
                  expect(interception.response?.statusCode).to.eq(200);
                });
              });
            });
          });
        });
      });
    });
  });
});
