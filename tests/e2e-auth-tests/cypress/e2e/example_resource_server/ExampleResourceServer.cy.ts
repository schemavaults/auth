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

  it("auto-completes PKCE flow with existing auth-server session when resource server is logged out", () => {
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
            const email = `pkce-session-persist-test-${suffix}@example.com`;
            const password = "TestPassword123!";

            // Step 1: Register User A via PKCE flow (creates account + authorizes the app)
            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              // Step 2: Logout from everything (auth-server session + resource server)
              cy.logout();

              // Step 3: Re-login directly on the auth-server (primary origin).
              // This establishes the refresh token cookie reliably on the
              // primary origin — Cypress does not preserve cookies set during
              // cy.origin() transitions.
              cy.login(email, password).then((loginSuccess: boolean) => {
                if (!loginSuccess) {
                  throw new Error("Failed to login directly to auth-server");
                }

                // Step 4: Start a new PKCE flow from the resource server.
                // The Login click redirects to the auth-server, which should
                // detect the existing session and auto-complete the flow.
                cy.origin(exampleAppOrigin, () => {
                  cy.visit("/");
                  cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
                  cy.contains("button", "Login").click();
                });

                // Step 5: Handle possible consent screen (should be skipped
                // since app was authorized during registration in step 1).
                cy.get("body", { timeout: 15000 }).then(($body) => {
                  if ($body.text().includes("Authorize & Continue")) {
                    cy.contains("Authorize & Continue").should("be.visible").click();
                  }
                });

                // Step 6: Verify redirect to resource server /account page
                cy.origin(exampleAppOrigin, () => {
                  cy.url({ timeout: 30000 }).should("include", "/account");
                  cy.contains("Example Account Page", { timeout: 15000 }).should(
                    "be.visible",
                  );
                  cy.contains(
                    "If you're seeing this it means that you were not redirected because you are logged in!",
                  ).should("be.visible");
                });
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

                cy.visit("/auth/login");

                // Should be redirected to /account since the middleware still
                // considers the user logged in (valid refresh token exists)
                // and new access tokens are generated via the refresh token
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
});
