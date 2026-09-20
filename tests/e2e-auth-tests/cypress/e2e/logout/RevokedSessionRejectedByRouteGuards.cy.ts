// RevokedSessionRejectedByRouteGuards.cy.ts
//
// Logout must end the session everywhere, not only at the refresh grant.
// A copy of the pre-logout refresh-token cookie (a stolen browser profile,
// an exfiltrated backup) still verifies cryptographically for two weeks;
// the route guards consult the revocation state so it is rejected at every
// guarded API route — including the one that mints authorization codes,
// which would otherwise launder the dead session into a fresh, fully valid
// one.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
  RefreshTokenCookieName,
} from "@schemavaults/auth-common";

const APP_ID = getAuthServerAppIdFromCypressEnv();
const REFRESH_TOKEN_COOKIE = RefreshTokenCookieName(APP_ID);

interface GuardedResponseBody {
  success?: boolean;
  message?: string;
  authorization_code?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function getProfile(): Cypress.Chainable<Cypress.Response<GuardedResponseBody>> {
  return cy.request<GuardedResponseBody>({
    method: "GET",
    url: "/api/user/profile",
    failOnStatusCode: false,
  });
}

function mintAuthorizationCode(): Cypress.Chainable<
  Cypress.Response<GuardedResponseBody>
> {
  const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
  return cy
    .wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
      PKCE_ProofKeyManager.createCodeChallenge(verifier),
      { log: false },
    )
    .then((challenge) =>
      cy.request<GuardedResponseBody>({
        method: "POST",
        url: "/api/auth/session/generate-authorization-code",
        failOnStatusCode: false,
        body: {
          client_app_id: APP_ID,
          code_challenge: challenge.code_challenge,
          code_challenge_method: "S256",
          challenge_time: challenge.challenge_time,
          scope: DEFAULT_AUTH_SCOPE,
        },
      }),
    );
}

describe("Revoked session is rejected by the route guards", () => {
  it("rejects a pre-logout refresh token cookie at guarded API routes after logout", () => {
    cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }

      // Sanity: the live session reaches a guarded route.
      getProfile().then((response) => {
        expect(response.status, "guarded route with live session").to.eq(200);
      });

      // The request-based login does not navigate the browser; land on the
      // account page before driving the logout UI.
      cy.visit("/account");
      cy.url().should("include", "/account");

      cy.getCookie(REFRESH_TOKEN_COOKIE)
        .should("exist")
        .then((cookie) => {
          if (!cookie || !cookie.value) {
            throw new Error("Refresh token cookie not found");
          }
          // What an attacker holding a copy of the cookie replays later.
          const capturedRefreshToken: string = cookie.value;

          cy.logout().then(() => {
            cy.getCookie(REFRESH_TOKEN_COOKIE).should("not.exist");

            // Replay the captured cookie: it still decrypts and verifies,
            // but the guard must see it as revoked.
            cy.setCookie(REFRESH_TOKEN_COOKIE, capturedRefreshToken);

            getProfile().then((response) => {
              expect(
                response.status,
                "guarded route with revoked session",
              ).to.eq(401);
              expect(response.body.message).to.include("revoked");
            });

            // The code-minting route sits behind the same guard: a revoked
            // session must not be able to mint a fresh authorization code.
            mintAuthorizationCode().then((response) => {
              expect(
                response.status,
                "authorization code minting with revoked session",
              ).to.eq(401);
              expect(response.body).to.not.have.property("authorization_code");
            });

            cy.clearCookies();
          });
        });
    });
  });
});
