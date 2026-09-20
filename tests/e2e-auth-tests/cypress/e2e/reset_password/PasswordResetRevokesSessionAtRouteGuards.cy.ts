// PasswordResetRevokesSessionAtRouteGuards.cy.ts
//
// A password reset is the standard incident response to a stolen session,
// so it must kill that session everywhere: at the route guards (the
// pre-reset refresh token still verifies cryptographically, but its `iat`
// is now older than the user's tokens_valid_after watermark) AND at the
// authorization_code grant (a code minted by the pre-reset session must not
// redeem into a fresh token set whose `iat` is past the watermark).

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  type CodeVerifierWithDetails,
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

interface TokenResponseBody {
  error?: string;
  error_description?: string;
  access_token?: string;
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

function mintAuthorizationCode(
  challenge: CodeChallengeWithDetails,
): Cypress.Chainable<Cypress.Response<GuardedResponseBody>> {
  return cy.request<GuardedResponseBody>({
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
  });
}

// Redeems an authorization code at the OIDC token endpoint (RFC 6749
// §4.1.3, form-encoded). The auth server's own app has no third-party
// redirect_uri bound to its codes, so none is presented.
function redeemAuthorizationCode(
  code: string,
  verifier: CodeVerifierWithDetails,
): Cypress.Chainable<Cypress.Response<TokenResponseBody>> {
  return cy.request<TokenResponseBody>({
    method: "POST",
    url: "/api/oidc/token",
    form: true,
    body: {
      grant_type: "authorization_code",
      client_id: APP_ID,
      code,
      code_verifier: verifier.code_verifier,
    },
    headers: {
      Origin: new URL(Cypress.config("baseUrl")!).origin,
    },
    failOnStatusCode: false,
  });
}

describe("Password Reset Revokes Session At Route Guards", () => {
  it("rejects the pre-reset session at guarded routes and refuses to redeem a code it minted", () => {
    const newPassword = "RevokedAtGuards123!@#";
    const verifier: CodeVerifierWithDetails =
      PKCE_ProofKeyManager.createCodeVerifier(Date.now());

    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (success) => {
          expect(
            success,
            "create_and_login_as_regular_user_via_request should succeed",
          ).to.be.true;

          // Sanity: the live session reaches a guarded route.
          getProfile().then((response) => {
            expect(response.status, "guarded route with live session").to.eq(
              200,
            );
          });

          cy.getCookie(REFRESH_TOKEN_COOKIE)
            .should("exist")
            .then((cookie) => {
              if (!cookie || !cookie.value) {
                throw new Error("Refresh token cookie not found");
              }
              // The token the "attacker" exfiltrated before the reset.
              const capturedRefreshToken: string = cookie.value;

              // While the session is still live, mint an authorization
              // code with it — the laundering vector: redeeming it after
              // the reset would issue tokens with a fresh iat.
              cy.wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
                PKCE_ProofKeyManager.createCodeChallenge(verifier),
                { log: false },
              )
                .then((challenge) => mintAuthorizationCode(challenge))
                .then((mintResponse) => {
                  expect(
                    mintResponse.status,
                    "authorization code minting with live session",
                  ).to.eq(200);
                  const preResetCode = mintResponse.body.authorization_code;
                  if (typeof preResetCode !== "string") {
                    throw new Error("No authorization_code in mint response");
                  }

                  // End the legitimate session locally WITHOUT logging out
                  // (logout revokes server-side too; this spec must prove
                  // the *password reset* is what revokes the session).
                  cy.clearCookies();

                  // The tokens_valid_after watermark has one-second
                  // granularity and uses strict less-than: wait out the
                  // second boundary so the captured token's iat (and the
                  // code's created_at) land strictly before the watermark
                  // the reset confirm sets below.
                  cy.wait(2000);

                  cy.request({
                    method: "GET",
                    url: `/api/test/password-reset-token/${encodeURIComponent(credentials.email)}`,
                    failOnStatusCode: false,
                  }).then((tokenResponse) => {
                    expect(tokenResponse.status).to.equal(200);
                    expect(tokenResponse.body.token).to.be.a("string");
                    const resetToken: string = tokenResponse.body.token;

                    cy.request({
                      method: "POST",
                      url: "/api/auth/reset-password/confirm",
                      body: { token: resetToken, new_password: newPassword },
                      failOnStatusCode: false,
                    }).then((confirmResponse) => {
                      expect(confirmResponse.status).to.equal(200);

                      // Replay the captured cookie at a guarded route: it
                      // still verifies, but is older than the watermark.
                      cy.setCookie(REFRESH_TOKEN_COOKIE, capturedRefreshToken);
                      getProfile().then((response) => {
                        expect(
                          response.status,
                          "guarded route with pre-reset session",
                        ).to.eq(401);
                        expect(response.body.message).to.include("revoked");
                      });

                      // ...and it can no longer mint codes either.
                      cy.wrap<
                        Promise<CodeChallengeWithDetails>,
                        CodeChallengeWithDetails
                      >(
                        PKCE_ProofKeyManager.createCodeChallenge(
                          PKCE_ProofKeyManager.createCodeVerifier(Date.now()),
                        ),
                        { log: false },
                      )
                        .then((challenge) => mintAuthorizationCode(challenge))
                        .then((response) => {
                          expect(
                            response.status,
                            "authorization code minting with pre-reset session",
                          ).to.eq(401);
                        });
                      cy.clearCookies();

                      // The code minted BEFORE the reset must not redeem:
                      // its created_at predates the watermark.
                      redeemAuthorizationCode(preResetCode, verifier).then(
                        (redeemResponse) => {
                          expect(
                            redeemResponse.status,
                            "redeeming a pre-reset authorization code",
                          ).to.eq(400);
                          expect(redeemResponse.body.error).to.eq(
                            "invalid_grant",
                          );
                          expect(
                            redeemResponse.body.error_description,
                          ).to.include("revoked");
                          expect(redeemResponse.body).to.not.have.property(
                            "access_token",
                          );
                        },
                      );
                    });
                  });
                });
            });
        },
      );
    });
  });
});
