export interface LoginViaResourceServerPkceFlowParams {
  resource_server_origin: string;
  email: string;
  password: string;
}

/**
 * Clicks the consent screen's "Authorize & Continue". On the server-rendered
 * consent page the button stays disabled until the auth client has hydrated
 * and initialised from the session cookie, so wait for it to become enabled
 * rather than clicking the first paint.
 */
function clickAuthorizeAndContinue(): void {
  cy.contains("Authorize & Continue", { timeout: 20000 })
    .should("be.visible")
    .should("not.be.disabled")
    .click();
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
  // The login form asks the server whether the user already authorized the
  // app right after an `authenticated` answer, and shows the consent screen
  // only when they have not. Waiting on that request (instead of sniffing
  // the page text) makes the consent step deterministic.
  cy.intercept({
    method: "GET",
    url: "**/api/apps/*/check-authorization*",
  }).as("checkAppAuthorizationViaResourceServerPkceFlow");
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
        // Resuming re-enters /auth/login, whose already-signed-in branch
        // shows the consent screen unless the user authorized the app
        // before. Ask the server now (the session cookie is set) so the
        // consent step below is deterministic.
        cy.url({ log: false }).then((interstitialUrl: string) => {
          const app_id: string | null = new URL(interstitialUrl).searchParams.get("app_id");
          if (!app_id) {
            throw new Error("The verify-email interstitial URL carries no app_id");
          }
          cy.request({
            method: "GET",
            url: `/api/apps/${encodeURIComponent(app_id)}/check-authorization`,
            failOnStatusCode: false,
            log: false,
          }).then((response) => {
            const authorized: boolean = response.body?.authorized === true;
            // Resume the flow. The interstitial also polls `whoami` and
            // auto-continues once the address is verified, so the button
            // may already be gone by the time we get here: click it
            // natively when it is still there and otherwise let the
            // auto-continue carry on.
            cy.get("body").then(($body) => {
              const $button = $body.find(
                '[data-testid="continue-after-email-verification-button"]',
              );
              const button: HTMLElement | undefined = $button.get(0);
              if (button) {
                button.click();
              }
            });
            if (!authorized) {
              clickAuthorizeAndContinue();
            }
          });
        });
      } else if (kind === "authenticated") {
        // Step 5: the form checks the app authorization next; the consent
        // screen renders only when the user has not authorized the app yet,
        // otherwise the form redirects straight to the resource server.
        cy.wait("@checkAppAuthorizationViaResourceServerPkceFlow", {
          timeout: 20000,
        }).then((check) => {
          if (check.response?.body?.authorized !== true) {
            clickAuthorizeAndContinue();
          }
        });
      } else {
        throw new Error(
          `Unexpected /api/auth/login response kind: ${String(kind)} (status ${interception.response?.statusCode})`,
        );
      }
    },
  );

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
