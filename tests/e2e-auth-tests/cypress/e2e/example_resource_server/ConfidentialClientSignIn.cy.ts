// ConfidentialClientSignIn.cy.ts
//
// Covers signing in to the auth server from the external example
// resource server as an OAuth2/OIDC *confidential* client — an app with
// a client secret registered on the auth server — using the generic
// `openid-client` npm package as a spec-compliant relying party.
//
// The sibling spec OpenidClientSignIn.cy.ts drives the same flow as a
// public (PKCE-only) client against a different seeded app. The two
// apps are deliberately separate: registering a client secret makes
// client authentication mandatory on every token surface for that app,
// which would break the public-client specs in this suite.
//
// The RP-side implementation lives in the example app's
// /openid-client-confidential/* routes
// (tests/example-nextjs-resource-server/src/app/openid-client-confidential/),
// which authenticate at the token endpoint with client_secret_basic
// (an HTTP Basic Authorization header, RFC 6749 §2.3.1) on top of the
// mandatory PKCE S256 binding. A green run here means the whole loop
// held: authorize -> login UI -> consent -> authenticated token
// exchange -> id_token validation -> userinfo.

describe("ConfidentialClientSignIn (openid-client RP, client_secret_basic)", () => {
  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  // Normalize origin to strip default port 80 — cy.origin() requires
  // the argument to match the browser's normalised origin exactly.
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;

  // The id_token `iss` claim is the auth server's public URL; the
  // Cypress AUTH_SERVER_URL env resolves from the same source
  // (getAuthServerUrl) in cypress.config.ts.
  const expectedIssuer: string = new URL(Cypress.env("AUTH_SERVER_URL")).origin;

  // The confidential app id seeded in cypress.config.ts's before:run
  // hook — the RP's OIDC client_id, which becomes the id_token `aud`
  // claim. Same value the example resource server container gets as
  // OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID.
  const confidentialClientId: string = Cypress.env(
    "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID",
  );

  /**
   * Drives the confidential-client sign-in flow from the example
   * resource server's home page through the auth server's login UI and
   * back to the RP's /openid-client-confidential/profile page, then
   * asserts the identity claims established by the id_token + userinfo
   * validation.
   *
   * `consent: "required"` asserts the first-time authorization screen
   * appears and approves it; `consent: "none"` expects the flow to
   * proceed straight to the callback (app already authorized).
   */
  function signInViaConfidentialClientFlow(
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
      cy.get("[data-testid='openid-client-confidential-login-link']").click();
    });

    // Step 2: The RP's /openid-client-confidential/login route handler
    // redirects through GET /api/oidc/authorize, which bridges to the
    // login UI with the PKCE params bound to the flow.
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
    // Consent is per user + app, so a user who already authorized the
    // public-client app still sees it for this one.
    if (consent === "required") {
      cy.contains("Authorize & Continue", { timeout: 15000 })
        .should("be.visible")
        .click();
    }

    // Step 5: The auth server redirects to the RP's callback with
    // code/state/iss; openid-client redeems the code (PKCE verifier +
    // client_secret_basic credentials, state/iss checks, id_token
    // signature + nonce validation) and the RP lands on its profile page
    // with the established identity.
    cy.origin(
      exampleAppOrigin,
      { args: { email, expectedIssuer, confidentialClientId } },
      ({ email, expectedIssuer, confidentialClientId }) => {
        cy.url({ timeout: 30000 }).should(
          "include",
          "/openid-client-confidential/profile",
        );
        cy.get("[data-testid='openid-client-confidential-signed-in']", {
          timeout: 15000,
        }).should("be.visible");
        cy.get("[data-testid='openid-client-confidential-sub']")
          .invoke("text")
          .should("have.length.greaterThan", 0);
        cy.get("[data-testid='openid-client-confidential-iss']").should(
          "have.text",
          expectedIssuer,
        );
        // The `aud` claim proves the tokens were minted for the
        // confidential app, not the public one.
        cy.get("[data-testid='openid-client-confidential-aud']").should(
          "have.text",
          confidentialClientId,
        );
        // Userinfo claims (granted by the `email` scope) identify the
        // signed-in user.
        cy.get("[data-testid='openid-client-confidential-email']").should(
          "have.text",
          email,
        );
        cy.get("[data-testid='openid-client-confidential-email-verified']")
          .invoke("text")
          .should("be.oneOf", ["true", "false"]);
      },
    );
  }

  it("signs in through the authorization code flow with PKCE + client_secret_basic", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) throw new Error("Failed to login as superuser");

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) throw new Error("Failed to create invite code");

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `confidential-client-signin-${suffix}@example.com`;
            const password = "TestPassword123!";

            // The flow under test is sign-in, so create the account
            // directly on the auth server first.
            cy.register(email, password, inviteCode).then(
              (statusCode: number) => {
                expect(statusCode, "register status code").to.equal(200);

                cy.logout();

                signInViaConfidentialClientFlow(email, password, "required");
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
            const email = `confidential-client-relogin-${suffix}@example.com`;
            const password = "TestPassword123!";

            cy.register(email, password, inviteCode).then(
              (statusCode: number) => {
                expect(statusCode, "register status code").to.equal(200);

                cy.logout();

                // First sign-in authorizes the confidential app.
                signInViaConfidentialClientFlow(email, password, "required");

                // Log out of the auth server so the second sign-in
                // exercises the full login form again — this time the
                // consent screen is skipped because the app is already
                // authorized for the user.
                cy.logout();

                signInViaConfidentialClientFlow(email, password, "none");
              },
            );
          });
        });
      });
    });
  });
});
