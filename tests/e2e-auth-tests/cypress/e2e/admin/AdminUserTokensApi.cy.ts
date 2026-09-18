// Covers GET /api/admin/users/[uid]/tokens, which only had an unasserted
// render-time call from the admin user detail page. Issued-token rows are
// recorded when an authorization code is redeemed at the token endpoint, so
// the spec logs in with a locally generated PKCE pair, redeems the code at
// POST /api/oidc/token, and then lists the resulting tokens as an admin.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface IssuedTokenRow {
  token_type: "access" | "refresh";
  grant_type: string;
  client_app_id: string;
  uid?: string;
  issued_at?: number;
  expires_at?: number;
}

interface ListTokensResponseBody {
  success: boolean;
  message?: string;
  data?: { tokens: IssuedTokenRow[] };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const MALFORMED_UID = "not-a-uuid";

function loginAsSuperuser(): void {
  cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
    if (!ok) throw new Error("Failed to login as superuser");
  });
}

/**
 * Registers a user, logs in with a known PKCE verifier and redeems the
 * authorization code at the OIDC token endpoint so at least one access and
 * one refresh token are recorded for the account. Yields the uid.
 */
function createUserWithIssuedTokens(): Cypress.Chainable<string> {
  return cy.generate_random_test_user_credentials().then((credentials) => {
    return cy
      .create_and_login_as_regular_user_via_request(credentials)
      .then((created: boolean) => {
        expect(created, "regular user registration should succeed").to.be.true;
        return cy
          .request({ method: "GET", url: `/api/auth/whoami/${AUTH_APP_ID}` })
          .then((whoami) => {
            const uid: string = whoami.body.user.uid;
            cy.logout();
            cy.reset_rate_limit();

            const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
            return cy
              .wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
                PKCE_ProofKeyManager.createCodeChallenge(verifier),
                { log: false },
              )
              .then((challenge) => {
                return cy
                  .request({
                    method: "POST",
                    url: "/api/auth/login",
                    body: {
                      credentials,
                      client_app_id: AUTH_APP_ID,
                      code_challenge: challenge.code_challenge,
                      challenge_time: challenge.challenge_time,
                      nonce: `e2e-nonce-${Date.now()}`,
                      scope: DEFAULT_AUTH_SCOPE,
                    },
                  })
                  .then((loginResponse) => {
                    expect(loginResponse.status).to.eq(200);
                    expect(loginResponse.body.kind).to.eq("authenticated");
                    const code: string = loginResponse.body.authorization_code;

                    return cy
                      .request({
                        method: "POST",
                        url: "/api/oidc/token",
                        form: true,
                        body: {
                          grant_type: "authorization_code",
                          client_id: AUTH_APP_ID,
                          code,
                          code_verifier: verifier.code_verifier,
                        },
                        headers: { Accept: "application/json" },
                      })
                      .then((tokenResponse) => {
                        expect(tokenResponse.status, "token exchange").to.eq(200);
                        expect(tokenResponse.body.access_token).to.be.a("string");
                        cy.clearCookies();
                        return uid;
                      });
                  });
              });
          });
      });
  });
}

describe("GET /api/admin/users/:uid/tokens", () => {
  it("returns 400 for a malformed uid or an invalid token_type filter", () => {
    loginAsSuperuser();
    cy.request({
      method: "GET",
      url: `/api/admin/users/${MALFORMED_UID}/tokens`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.body).to.have.property("success", false);
    });
    cy.request({
      method: "GET",
      url: `/api/admin/users/00000000-0000-0000-0000-000000000099/tokens?token_type=bogus`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.body).to.have.property("success", false);
    });
  });

  it("lists the access and refresh tokens issued to a user, honouring the token_type filter", () => {
    createUserWithIssuedTokens().then((uid) => {
      loginAsSuperuser();

      cy.request<ListTokensResponseBody>({
        method: "GET",
        url: `/api/admin/users/${uid}/tokens`,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        const tokens = response.body.data?.tokens ?? [];
        expect(tokens.length, "issued tokens").to.be.greaterThan(0);
        expect(tokens.some((t) => t.token_type === "access")).to.eq(true);
        expect(tokens.some((t) => t.token_type === "refresh")).to.eq(true);
        expect(tokens.every((t) => t.client_app_id === AUTH_APP_ID)).to.eq(
          true,
        );
        expect(
          tokens.every((t) => t.grant_type === "authorization_code"),
        ).to.eq(true);
      });

      cy.request<ListTokensResponseBody>({
        method: "GET",
        url: `/api/admin/users/${uid}/tokens?token_type=refresh`,
      }).then((response) => {
        expect(response.status).to.eq(200);
        const tokens = response.body.data?.tokens ?? [];
        expect(tokens.length).to.be.greaterThan(0);
        expect(tokens.every((t) => t.token_type === "refresh")).to.eq(true);
      });

      cy.request<ListTokensResponseBody>({
        method: "GET",
        url: `/api/admin/users/${uid}/tokens?token_type=access`,
      }).then((response) => {
        expect(response.status).to.eq(200);
        const tokens = response.body.data?.tokens ?? [];
        expect(tokens.length).to.be.greaterThan(0);
        expect(tokens.every((t) => t.token_type === "access")).to.eq(true);
      });
    });
  });

  it("returns an empty list for a uid with no issued tokens", () => {
    loginAsSuperuser();
    cy.request<ListTokensResponseBody>({
      method: "GET",
      url: `/api/admin/users/00000000-0000-0000-0000-000000000099/tokens`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.data?.tokens).to.deep.equal([]);
    });
  });
});
