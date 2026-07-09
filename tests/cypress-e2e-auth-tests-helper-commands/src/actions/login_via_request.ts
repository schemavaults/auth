import { DEFAULT_AUTH_SERVER_APP_ID } from "@schemavaults/app-definitions";
import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
  RefreshTokenCookieName,
} from "@schemavaults/auth-common";

const ROUTE = "/api/auth/login";

/**
 * Faster equivalent of cy.login(): authenticates by POSTing directly to
 * /api/auth/login instead of driving the login form through the UI. The
 * auth-server sets the auth-server refresh-token cookie in the login response,
 * which alone is sufficient to authenticate subsequent same-origin requests
 * (including page navigations) to the auth-server. The OAuth2 token-exchange
 * step is intentionally skipped because no client-app session is needed when
 * the auth-server is itself the only resource being exercised.
 */
export default function login_via_request(
  email: string,
  password: string,
): Cypress.Chainable<boolean> {
  cy.is_authenticated().then((authenticated: boolean) => {
    if (authenticated) {
      throw new Error(
        `cy.login_via_request() should be called from an unauthenticated user; this session is already authenticated!`,
      );
    }
  });

  cy.reset_rate_limit();

  cy.log(`[cy.login_via_request] Attempting to login as user: '${email}'`);

  const code_verifier_with_details = PKCE_ProofKeyManager.createCodeVerifier(
    Date.now(),
  );

  return cy
    .wrap<
      Promise<CodeChallengeWithDetails>,
      CodeChallengeWithDetails
    >(PKCE_ProofKeyManager.createCodeChallenge(code_verifier_with_details), { log: false })
    .then((challenge: CodeChallengeWithDetails): Cypress.Chainable<boolean> => {
      return cy
        .request({
          method: "POST",
          url: ROUTE,
          failOnStatusCode: false,
          body: {
            credentials: { email, password },
            client_app_id: DEFAULT_AUTH_SERVER_APP_ID,
            code_challenge: challenge.code_challenge,
            challenge_time: challenge.challenge_time,
          },
        })
        .then((response): Cypress.Chainable<boolean> => {
          const status: number = response.status;
          if (status === 429) {
            throw new Error(
              `cy.login_via_request was rate-limited (HTTP 429). Call cy.reset_rate_limit() before this command.`,
            );
          }
          if (status !== 200) {
            cy.log(
              `[cy.login_via_request] Login request failed with status ${status}`,
            );
            return cy.wrap<boolean>(false, { log: false });
          }
          const body = response.body as
            | { kind?: string; success?: boolean }
            | undefined;
          if (body?.kind !== "authenticated") {
            cy.log(
              `[cy.login_via_request] Login response did not return an authenticated session (kind='${body?.kind}'). MFA-enrolled users must use the UI flow.`,
            );
            return cy.wrap<boolean>(false, { log: false });
          }

          // The auth-server's login response sets the refresh-token cookie
          // directly, so verify it exists before declaring success.
          return cy
            .getCookie(RefreshTokenCookieName(DEFAULT_AUTH_SERVER_APP_ID), {
              timeout: 5000,
            })
            .should("exist")
            .then((): Cypress.Chainable<boolean> => {
              cy.is_authenticated().should(
                "equal",
                true,
                "User should be authenticated after cy.login_via_request",
              );
              return cy.wrap(true, { log: false });
            });
        });
    });
}
