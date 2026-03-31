export interface LoginViaResourceServerPkceFlowParams {
  resource_server_origin: string;
  email: string;
  password: string;
}

export default function login_via_resource_server_pkce_flow(
  params: LoginViaResourceServerPkceFlowParams,
): Cypress.Chainable<boolean> {
  const { resource_server_origin, email, password } = params;
  const origin: string = new URL(resource_server_origin).origin;

  // Step 1: Clear stored auth state from the resource server's origin,
  // then visit its home page and click "Login". In development/test the
  // resource server stores refresh tokens in localStorage (not HTTP-only
  // cookies), so we must clear localStorage from within the resource
  // server's origin context for it to take effect.
  cy.clearAllCookies();
  cy.origin(origin, () => {
    localStorage.clear();
    sessionStorage.clear();
    cy.visit("/");
    cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
    cy.contains("button", "Login").click();
  });

  // Step 2: Resource server redirects to auth server's /auth/login with PKCE params
  cy.url({ timeout: 20000 }).should("include", "/auth/login");
  cy.url().should("include", "code_challenge");
  cy.wait_for_page_hydration();

  // Step 3: Fill the login form on the auth server
  cy.get("input[name='email']")
    .should("be.visible")
    .type(email, { force: true });
  cy.get("input[name='password']")
    .should("be.visible")
    .type(password, { force: true });

  cy.get("button[type='submit']").should("not.be.disabled").click();

  // Step 4: After login, the auth server either shows the consent screen
  // (first-time app authorization) or redirects directly to the resource
  // server (already consented — the common case after prior registration).
  // We handle both by first checking if we're still on the auth server.
  cy.get("body", { timeout: 15000 }).then(($body) => {
    if ($body.text().includes("Authorize & Continue")) {
      cy.contains("Authorize & Continue").should("be.visible").click();
    }
  });

  // Step 5: Verify redirect back to resource server's /account page
  return cy.origin(origin, () => {
    cy.url({ timeout: 30000 }).should("include", "/account");
    cy.contains("Example Account Page", { timeout: 15000 }).should(
      "be.visible",
    );
    cy.contains(
      "If you're seeing this it means that you were not redirected because you are logged in!",
    ).should("be.visible");
    return cy.wrap(true, { log: false });
  });
}
