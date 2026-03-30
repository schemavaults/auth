describe("ExampleResourceServer", () => {
  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  // Normalize origin to strip default port 80 — cy.origin() requires
  // the argument to match the browser's normalised origin exactly.
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;

  it("can visit the example resource server", () => {
    cy.visit(exampleAppUrl);
    cy.origin(exampleAppOrigin, () => {
      cy.url().should("include", "example-nextjs-resource-server");
      cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
    });
  });

  it("can register a new user through the full OAuth2 PKCE flow and access the protected /account route", () => {
    // Step 1: Login as admin and create an invite code for the new user
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to login as superuser");
      }

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) {
            throw new Error("Failed to create invite code");
          }

          // Step 2: Logout from admin session
          cy.logout();

          // Step 3: Visit example app and click "Register"
          // This is cross-origin (example app vs auth server base URL)
          cy.visit(exampleAppUrl);
          cy.origin(exampleAppOrigin, () => {
            cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
            cy.contains("button", "Register").click();
          });

          // Step 4: Example app's /auth/register generates PKCE params and
          // redirects to auth server's /auth/register with code_challenge,
          // redirect_uri, and app_id query parameters.
          // After the redirect we're back on the auth server origin.
          cy.url({ timeout: 20000 }).should("include", "/auth/register");
          cy.url().should("include", "code_challenge");
          cy.wait_for_page_hydration();

          // Step 5: Fill the registration form on the auth server
          cy.generate_random_code(12).then((suffix: string) => {
            const email = `pkce-reg-test-${suffix}@example.com`;
            const password = "TestPassword123!";

            cy.get("input[name='email']")
              .should("be.visible")
              .type(email, { force: true });
            cy.get("input[name='password']")
              .should("be.visible")
              .type(password, { force: true });
            cy.get("input[name='confirm']")
              .should("be.visible")
              .type(password, { force: true });
            cy.get("input[name='invite_code']")
              .should("not.be.disabled")
              .type(inviteCode, { force: true });

            cy.get("button[type='submit']")
              .should("not.be.disabled")
              .click();

            // Step 6: Consent screen appears because the example app is not a
            // hardcoded app — AppAuthorizationConsentScreen renders in
            // authorize-only mode. Click "Authorize & Continue" to approve.
            cy.contains("Authorize & Continue", { timeout: 15000 })
              .should("be.visible")
              .click();

            // Step 7: Auth server redirects back to example app's
            // /auth/authorize?authorization_code=...&challenge_time=...
            // The example app's useTradeAuthorizationCodeForTokensEffect
            // exchanges the auth code + stored code_verifier for tokens,
            // then redirects to /account.

            // Step 8: Verify the protected /account page renders successfully
            // We're back on the example app origin after the redirect chain.
            cy.origin(exampleAppOrigin, () => {
              cy.url({ timeout: 30000 }).should("include", "/account");
              cy.contains("Example Account Page", {
                timeout: 15000,
              }).should("be.visible");
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
