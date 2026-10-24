// A signed-out visitor of a resource server's guarded page is sent to the
// resource server's /auth/login with the page as `next_href`
// (withAuthenticatedServerComponentRouteGuard's `next_href` option). The
// generated login page hands it to the client SDK, which keeps it across
// the auth server round trip, and the generated /auth/authorize page sends
// the user back to it instead of `successful_authentication_redirect_uri`.

describe("Resource server post-login redirect via next_href", () => {
  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;

  beforeEach(() => {
    cy.reset_rate_limit();
  });

  /**
   * Registers a user through the example resource server (which also
   * authorizes its app), then leaves them signed in to the auth server
   * only, so a PKCE flow started by the resource server completes at once.
   */
  function signInToAuthServerOnly(suffix: string): void {
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

          cy.generate_random_code(12).then((random: string) => {
            const email = `pkce-next-href-${suffix}-${random}@example.com`;
            const password = "TestPassword123!";
            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              cy.logout();
              cy.clearAllCookies();
              cy.login(email, password).then((loggedIn: boolean) => {
                if (!loggedIn) {
                  throw new Error("Failed to login directly to auth-server");
                }
              });
            });
          });
        });
      });
    });
  }

  it("returns a signed-out visitor to the guarded page they were turned away from", () => {
    signInToAuthServerOnly("guard");

    const exampleApp = new URL(exampleAppOrigin);
    cy.intercept({
      method: "GET",
      hostname: exampleApp.hostname,
      port: Number(exampleApp.port) || 80,
      pathname: "/auth/login",
    }).as("resourceServerLoginPage");

    cy.origin(exampleAppOrigin, () => {
      localStorage.clear();
      sessionStorage.clear();
      cy.visit("/account?from=next-href-spec");
    });

    // The route guard forwards the attempted page (query included).
    cy.wait("@resourceServerLoginPage", { timeout: 20000 }).then(
      (interception) => {
        expect(
          new URL(interception.request.url).searchParams.get("next_href"),
        ).to.equal("/account?from=next-href-spec");
      },
    );

    // The auth server session completes the PKCE flow at once (the app was
    // authorized at registration); the authorize page then returns the user
    // to the attempted page, not the default /account.
    cy.origin(exampleAppOrigin, () => {
      cy.url({ timeout: 30000 }).should(
        "include",
        "/account?from=next-href-spec",
      );
      cy.contains("Example Account Page", { timeout: 15000 }).should(
        "be.visible",
      );
    });
  });

  it("ignores an off-origin next_href on the login page", () => {
    signInToAuthServerOnly("unsafe");

    cy.origin(exampleAppOrigin, () => {
      localStorage.clear();
      sessionStorage.clear();
      cy.visit(
        "/auth/login?next_href=" +
          encodeURIComponent("https://evil.example/phish"),
      );
    });

    cy.origin(exampleAppOrigin, () => {
      cy.location("pathname", { timeout: 30000 }).should("eq", "/account");
      cy.location("search").should("eq", "");
      cy.contains("Example Account Page", { timeout: 15000 }).should(
        "be.visible",
      );
    });
  });
});
