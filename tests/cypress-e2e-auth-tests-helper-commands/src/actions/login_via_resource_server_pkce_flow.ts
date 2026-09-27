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

  cy.intercept({ method: "POST", url: "**/api/auth/login" }).as(
    "loginViaResourceServerPkceFlow",
  );
  cy.get("button[type='submit']").should("not.be.disabled").click();

  // Step 4: While the `require_email_verification_for_third_party_apps`
  // server setting is on (the default), an account whose e-mail address is
  // not verified is parked on /auth/verify-email/required instead of being
  // handed off to the resource server. Specs should verify their users
  // up front (cy.verify_email_via_request) so this branch is not taken;
  // when it is, verify the address here and resume the flow.
  cy.wait("@loginViaResourceServerPkceFlow", { timeout: 20000 }).then(
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
          `Unexpected /api/auth/login response kind: ${String(kind)} (status ${interception.response?.statusCode})`,
        );
      }
    },
  );

  // Step 5: After login, the auth server either shows the consent screen
  // (first-time app authorization) or redirects directly to the resource
  // server (already consented — the common case after prior registration).
  // We handle both by first checking if we're still on the auth server.
  cy.get("body", { timeout: 15000 }).then(($body) => {
    if ($body.text().includes("Authorize & Continue")) {
      cy.contains("Authorize & Continue").should("be.visible").click();
    }
  });

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
