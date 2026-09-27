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

  cy.intercept({ method: "POST", url: "**/api/auth/register" }).as(
    "registerViaResourceServerPkceFlow",
  );
  cy.get("button[type='submit']").should("not.be.disabled").click();

  // Step 4: A brand-new account is unverified, so while the
  // `require_email_verification_for_third_party_apps` server setting is on
  // (the default) the auth server answers `email_verification_required`
  // (session cookie set, no authorization code) and the form parks the
  // user on /auth/verify-email/required. Verify the address through the
  // test-only token endpoint and resume the flow with the "Continue"
  // button, which re-enters /auth/login with the flow's parameters. With
  // the setting off the response is `authenticated` and the consent
  // screen follows directly.
  cy.wait("@registerViaResourceServerPkceFlow", { timeout: 20000 }).then(
    (interception) => {
      const kind: unknown = interception.response?.body?.kind;
      if (kind === "email_verification_required") {
        cy.url({ timeout: 20000 }).should("include", "/auth/verify-email/required");
        cy.get('[data-testid="email-verification-required-card"]', {
          timeout: 15000,
        }).should("be.visible");
        cy.verify_email_via_request(email).then((verified: boolean) => {
          if (!verified) {
            throw new Error(`Failed to verify the email address '${email}'`);
          }
        });
        // Resume the flow. The interstitial also polls `whoami` and
        // auto-continues once the address is verified, so the button may
        // already be gone by the time we get here: click it natively when
        // it is still there and otherwise let the auto-continue carry on.
        cy.get("body").then(($body) => {
          const $button = $body.find(
            '[data-testid="continue-after-email-verification-button"]',
          );
          const button: HTMLElement | undefined = $button.get(0);
          if (button) {
            button.click();
          }
        });
      } else if (kind !== "authenticated") {
        throw new Error(
          `Unexpected /api/auth/register response kind: ${String(kind)} (status ${interception.response?.statusCode})`,
        );
      }
    },
  );

  // Step 5: Consent screen — click "Authorize & Continue". A new account
  // never authorized the app, so consent is always asked: inline by the
  // register form (gate off) or on the server-rendered consent page the
  // resumed flow lands on (gate on). On the latter the button is disabled
  // until the auth client has hydrated and initialised from the session
  // cookie, so wait for it to become enabled rather than clicking the
  // first paint.
  cy.contains("Authorize & Continue", { timeout: 20000 })
    .should("be.visible")
    .should("not.be.disabled")
    .click();

  // Step 6: Verify redirect back to resource server's /account page
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
