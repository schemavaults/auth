export interface RegisterViaResourceServerPkceFlowParams {
  resource_server_origin: string;
  email: string;
  password: string;
  invite_code: string;
}

export default function register_via_resource_server_pkce_flow(
  params: RegisterViaResourceServerPkceFlowParams,
): Cypress.Chainable<boolean> {
  const { resource_server_origin, email, password, invite_code } = params;
  const origin: string = new URL(resource_server_origin).origin;

  // Step 1: Visit the resource server home page and click "Register"
  cy.origin(origin, () => {
    cy.visit("/");
    cy.contains("h1", "@schemavaults/example-nextjs-resource-server");
    cy.contains("button", "Register").click();
  });

  // Step 2: Resource server redirects to auth server's /auth/register with PKCE params
  cy.url({ timeout: 20000 }).should("include", "/auth/register");
  cy.url().should("include", "code_challenge");
  cy.wait_for_page_hydration();

  // Step 3: Fill the registration form on the auth server
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
    .type(invite_code, { force: true });

  cy.get("button[type='submit']").should("not.be.disabled").click();

  // Step 4: Consent screen — click "Authorize & Continue"
  cy.contains("Authorize & Continue", { timeout: 15000 })
    .should("be.visible")
    .click();

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
