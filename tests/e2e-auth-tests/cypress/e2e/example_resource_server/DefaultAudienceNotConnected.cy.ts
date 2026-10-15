// DefaultAudienceNotConnected.cy.ts
//
// The example resource server asks for an access token for its own API
// server (its default audience) when it redeems the authorization code on
// its generated /auth/authorize page. If the app is not connected to that
// API server, the token endpoint refuses the code grant with
// `invalid_target`.
//
// That refusal must land the user on the app's generated /auth/error page
// (`error_id=app_not_connected_to_api_server`), not back in the login flow:
// with a live auth server session, /auth/login immediately mints another
// code that fails the same way, so the browser would bounce between the
// app's /auth/login and /auth/authorize pages forever.
//
// The example app and its API server share one id and are seeded,
// connected to each other, in cypress.config.ts's before:run hook. This
// spec disconnects them and reconnects them afterwards so the rest of the
// suite is unaffected.

import { ERROR_MESSAGE_CATALOG } from "@schemavaults/auth-common";

describe("Sign-in when the app is not connected to its default audience", () => {
  const EXAMPLE_APP_AND_API_SERVER_ID = "00000000-0000-0000-0000-000000000000";
  const CONNECTION_URL = `/api/apis/${EXAMPLE_APP_AND_API_SERVER_ID}/connect_app/${EXAMPLE_APP_AND_API_SERVER_ID}`;

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  // Normalize origin to strip default port 80 — cy.origin() requires
  // the argument to match the browser's normalised origin exactly.
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;

  function setExampleAppConnectedToItsApiServer(connected: boolean): void {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }
      cy.request({
        method: connected ? "POST" : "DELETE",
        url: CONNECTION_URL,
        failOnStatusCode: false,
      }).then((response) => {
        // Connecting an app that is already connected answers 409.
        expect(
          response.status,
          connected ? "connect the example app" : "disconnect the example app",
        ).to.be.oneOf(connected ? [200, 409] : [200]);
      });
      cy.logout();
    });
  }

  after(() => {
    setExampleAppConnectedToItsApiServer(true);
  });

  it("sends the user to the error page instead of looping through the login flow", () => {
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
            const email = `unconnected-audience-test-${suffix}@example.com`;
            const password = "TestPassword123!";

            // Register through the app while it is still connected, so the
            // user has authorized the app and the next sign-in skips the
            // consent screen.
            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              cy.logout();

              setExampleAppConnectedToItsApiServer(false);

              // Sign out of the app, then sign in to the auth server only:
              // the app's login flow will find the auth server session and
              // complete without any user interaction, which is the
              // condition under which a failed exchange used to loop.
              cy.clearAllCookies();
              cy.origin(exampleAppOrigin, () => {
                localStorage.clear();
                sessionStorage.clear();
              });
              cy.login(email, password).then((loggedIn: boolean) => {
                if (!loggedIn) {
                  throw new Error("Failed to login to the auth server");
                }

                cy.origin(exampleAppOrigin, () => {
                  cy.visit("/");
                  cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
                  cy.contains("button", "Login").click();
                });

                cy.origin(
                  exampleAppOrigin,
                  {
                    args: {
                      message: ERROR_MESSAGE_CATALOG.app_not_connected_to_api_server,
                    },
                  },
                  ({ message }: { message: string }) => {
                    cy.location("pathname", { timeout: 30000 }).should(
                      "eq",
                      "/auth/error",
                    );
                    cy.location("search").should((search: string) => {
                      const params = new URLSearchParams(search);
                      expect(params.get("error_id"), "error_id").to.equal(
                        "app_not_connected_to_api_server",
                      );
                      expect(params.get("error"), "error").to.equal("403");
                    });
                    cy.contains(message, { timeout: 15000 }).should("be.visible");

                    // The user stays on the error page: nothing sends them
                    // back into the login flow.
                    cy.wait(3000);
                    cy.location("pathname").should("eq", "/auth/error");
                  },
                );
              });
            });
          });
        });
      });
    });
  });
});
