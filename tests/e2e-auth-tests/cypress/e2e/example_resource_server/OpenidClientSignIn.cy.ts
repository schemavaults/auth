// OpenidClientSignIn.cy.ts
//
// Covers signing in to the auth server from the external example
// resource server using the generic `openid-client` npm package — a
// spec-compliant OIDC relying party — instead of the SchemaVaults
// auth-server-sdk / auth-client-sdk. The RP-side implementation lives
// in the example app's /openid-client/* routes
// (tests/example-nextjs-resource-server/src/app/openid-client/), which
// discover the provider via /.well-known/openid-configuration and run
// the authorization-code + PKCE flow against /api/oidc/authorize and
// /api/oidc/token, validating the returned id_token (signature via the
// public jwks_uri, iss/aud/exp/nonce) and cross-checking the identity
// at /api/oidc/userinfo.

describe("OpenidClientSignIn (openid-client RP, authorization code + PKCE)", () => {
  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  // Normalize origin to strip default port 80 — cy.origin() requires
  // the argument to match the browser's normalised origin exactly.
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;

  // The id_token `iss` claim is the auth server's public URL; the
  // Cypress AUTH_SERVER_URL env resolves from the same source
  // (getAuthServerUrl) in cypress.config.ts.
  const expectedIssuer: string = new URL(
    Cypress.env("AUTH_SERVER_URL"),
  ).origin;

  // The app id seeded for the example resource server in
  // cypress.config.ts's before:run hook — the RP's OIDC client_id,
  // which becomes the id_token `aud` claim.
  const seededClientId = "00000000-0000-0000-0000-000000000000";

  /**
   * Drives the openid-client sign-in flow from the example resource
   * server's home page through the auth server's login UI and back to
   * the RP's /openid-client/profile page, then asserts the identity
   * claims established by the id_token + userinfo validation.
   *
   * `consent: "required"` asserts the first-time authorization screen
   * appears and approves it; `consent: "none"` expects the flow to
   * proceed straight to the callback (app already authorized).
   */
  function signInViaOpenidClientFlow(
    email: string,
    password: string,
    consent: "required" | "none",
  ): void {
    // Step 1: Start the flow on the RP. Clear RP-origin storage first so
    // a residual SDK session can't interfere with the flow under test.
    cy.origin(exampleAppOrigin, () => {
      localStorage.clear();
      sessionStorage.clear();
      cy.visit("/");
      cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
      cy.get("[data-testid='openid-client-login-link']").click();
    });

    // Step 2: The RP's /openid-client/login route handler redirects
    // through GET /api/oidc/authorize, which bridges to the login UI
    // with the PKCE params bound to the flow.
    cy.url({ timeout: 20000 }).should("include", "/auth/login");
    cy.url().should("include", "code_challenge");
    cy.wait_for_page_hydration();

    // Step 3: Authenticate with the real login form.
    cy.get("input[name='email']")
      .should("be.visible")
      .type(email, { force: true });
    cy.get("input[name='password']")
      .should("be.visible")
      .type(password, { force: true });
    cy.get("button[type='submit']").should("not.be.disabled").click();

    // Step 4: First-time authorization shows the consent screen;
    // subsequent sign-ins skip it (the app is already authorized).
    if (consent === "required") {
      cy.contains("Authorize & Continue", { timeout: 15000 })
        .should("be.visible")
        .click();
    }

    // Step 5: The auth server redirects to the RP's callback with
    // code/state/iss; openid-client redeems the code (PKCE verifier,
    // state/iss checks, id_token signature + nonce validation) and the
    // RP lands on its profile page with the established identity.
    cy.origin(
      exampleAppOrigin,
      { args: { email, expectedIssuer, seededClientId } },
      ({ email, expectedIssuer, seededClientId }) => {
        cy.url({ timeout: 30000 }).should("include", "/openid-client/profile");
        cy.get("[data-testid='openid-client-signed-in']", {
          timeout: 15000,
        }).should("be.visible");
        cy.get("[data-testid='openid-client-sub']")
          .invoke("text")
          .should("have.length.greaterThan", 0);
        cy.get("[data-testid='openid-client-iss']").should(
          "have.text",
          expectedIssuer,
        );
        cy.get("[data-testid='openid-client-aud']").should(
          "have.text",
          seededClientId,
        );
        // Userinfo claims (granted by the `email` scope) identify the
        // signed-in user.
        cy.get("[data-testid='openid-client-email']").should(
          "have.text",
          email,
        );
        cy.get("[data-testid='openid-client-email-verified']")
          .invoke("text")
          .should("be.oneOf", ["true", "false"]);
      },
    );
  }

  it("signs in through the openid-client authorization code flow with PKCE", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) throw new Error("Failed to login as superuser");

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) throw new Error("Failed to create invite code");

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `openid-client-signin-${suffix}@example.com`;
            const password = "TestPassword123!";

            // The flow under test is sign-in, so create the account
            // directly on the auth server first.
            cy.register(email, password, inviteCode).then(
              (statusCode: number) => {
                expect(statusCode, "register status code").to.equal(200);

                cy.logout();

                signInViaOpenidClientFlow(email, password, "required");
              },
            );
          });
        });
      });
    });
  });

  it("signs in again without the consent screen once the app is authorized", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) throw new Error("Failed to login as superuser");

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) throw new Error("Failed to create invite code");

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `openid-client-relogin-${suffix}@example.com`;
            const password = "TestPassword123!";

            cy.register(email, password, inviteCode).then(
              (statusCode: number) => {
                expect(statusCode, "register status code").to.equal(200);

                cy.logout();

                // First sign-in authorizes the client app (consent).
                signInViaOpenidClientFlow(email, password, "required");

                // Log out of the auth server so the second sign-in
                // exercises the full login form again — this time the
                // consent screen is skipped because the app is already
                // authorized for the user.
                cy.logout();

                signInViaOpenidClientFlow(email, password, "none");
              },
            );
          });
        });
      });
    });
  });
});
