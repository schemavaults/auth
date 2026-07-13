import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
  RefreshTokenCookieName,
} from "@schemavaults/auth-common";
import getAuthServerAppIdFromCypressEnv from "../get-auth-server-app-id-from-cypress-env";

const ROUTE = "/api/auth/register";

/**
 * Faster equivalent of cy.register(): registers a new user by POSTing
 * directly to /api/auth/register. Returns the HTTP status code so callers
 * can branch on 200/409/etc. just like the UI-based register command.
 */
export default function register_via_request(
  email: string,
  password: string,
  invite_code?: string,
): Cypress.Chainable<number> {
  const client_app_id = getAuthServerAppIdFromCypressEnv();

  cy.is_authenticated().should(
    "be.false",
    "User should not be authenticated before registration",
  );

  cy.reset_rate_limit();

  cy.log(
    `[cy.register_via_request] Attempting to register as user: '${email}'` +
      (invite_code ? ` (with invite code '${invite_code}')` : ""),
  );

  const code_verifier_with_details = PKCE_ProofKeyManager.createCodeVerifier(
    Date.now(),
  );

  return cy
    .wrap<
      Promise<CodeChallengeWithDetails>,
      CodeChallengeWithDetails
    >(PKCE_ProofKeyManager.createCodeChallenge(code_verifier_with_details), { log: false })
    .then((challenge: CodeChallengeWithDetails): Cypress.Chainable<number> => {
      const body: Record<string, unknown> = {
        credentials: { email, password },
        client_app_id,
        code_challenge: challenge.code_challenge,
        challenge_time: challenge.challenge_time,
        // scope + nonce are required, first-class register parameters.
        // crypto.randomUUID() is unavailable in the spec's browser context
        // (the auth server is not served from a secure context in CI), so
        // derive the nonce from the clock + Math.random instead.
        nonce: `e2e-nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        scope: "openid email profile",
      };
      if (invite_code) {
        body.invite_code = invite_code;
      }

      return cy
        .request({
          method: "POST",
          url: ROUTE,
          failOnStatusCode: false,
          body,
        })
        .then((response): Cypress.Chainable<number> => {
          const status: number = response.status;
          if (status === 429) {
            throw new Error(
              `cy.register_via_request was rate-limited (HTTP 429). Call cy.reset_rate_limit() before this command.`,
            );
          }
          if (status !== 200) {
            cy.log(
              `[cy.register_via_request] Register request failed with status ${status}`,
            );
            return cy.wrap<number>(status, { log: false });
          }

          // The auth-server's register response sets the refresh-token cookie
          // directly, so verify it exists before declaring success.
          return cy
            .getCookie(RefreshTokenCookieName(client_app_id), { timeout: 5000 })
            .should("exist")
            .then((): Cypress.Chainable<number> => {
              cy.is_authenticated().should(
                "equal",
                true,
                "User should be authenticated after cy.register_via_request",
              );
              return cy.wrap(200, { log: false });
            });
        });
    });
}
