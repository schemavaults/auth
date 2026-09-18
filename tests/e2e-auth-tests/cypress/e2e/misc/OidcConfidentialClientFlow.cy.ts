// End-to-end OIDC flow for a confidential client registered entirely through
// the management API (no test-only seeding, no example resource server), so
// it runs in the misc suite:
//   1. an app + domain + client secret are created by request;
//   2. the user authorizes the app and mints an authorization code through
//      POST /api/auth/session/generate-authorization-code;
//   3. POST /api/oidc/token redeems it with client_secret_post;
//   4. GET and POST /api/oidc/userinfo accept the access token (and refuse
//      the refresh token, a missing/malformed Authorization header and an
//      undecodable token);
//   5. POST /api/oidc/introspect reports both tokens active with their
//      metadata, and a different client's credentials see them as inactive.
// The `active: true` introspection path and POST userinfo were untested.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import { PKCE_ProofKeyManager, type CodeChallengeWithDetails } from "@schemavaults/auth-common";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface TokenResponseBody {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface UserinfoResponseBody {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  error?: string;
}

interface IntrospectionResponseBody {
  active: boolean;
  scope?: string;
  client_id?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  aud?: string;
  iss?: string;
  jti?: string;
  username?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const CLIENT_ORIGIN = "https://confidential-flow.example";
const REDIRECT_URI = `${CLIENT_ORIGIN}/oidc/callback`;
const SCOPE = "openid email profile";

function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface ConfidentialClient {
  client_id: string;
  client_secret: string;
}

/** Superuser creates a public web app with a domain and a client secret. */
function createConfidentialClient(withDomain = true): Cypress.Chainable<ConfidentialClient> {
  const client_id = `e2e-conf-${Math.random().toString(36).slice(2, 12)}`;
  return cy
    .create_and_login_as_superuser_via_request()
    .then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
      cy.request({
        method: "POST",
        url: "/api/apps",
        body: {
          app_id: client_id,
          app_name: `Confidential ${client_id}`,
          app_description: "OidcConfidentialClientFlow.cy.ts",
          created_at: Date.now(),
          public: true,
          hardcoded: false,
          web: true,
        },
      }).then((response) => expect(response.status).to.eq(200));
      if (withDomain) {
        cy.request({
          method: "POST",
          url: `/api/apps/${client_id}/domains`,
          body: {
            app_domain_ref_id: generateV4Uuid(),
            app_id: client_id,
            domain: CLIENT_ORIGIN,
            environment: Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test",
            created_at: Date.now(),
            hardcoded: false,
          },
        }).then((response) => expect(response.status).to.eq(200));
      }
      return cy.request({
        method: "POST",
        url: `/api/apps/${client_id}/client-secret`,
      });
    })
    .then((secret) => {
      expect(secret.status).to.eq(200);
      cy.logout();
      return { client_id, client_secret: secret.body.client_secret as string };
    });
}

function introspect(
  client: ConfidentialClient,
  token: string,
  extra: Record<string, string> = {},
): Cypress.Chainable<Cypress.Response<IntrospectionResponseBody>> {
  return cy.request<IntrospectionResponseBody>({
    method: "POST",
    url: "/api/oidc/introspect",
    form: true,
    body: {
      token,
      client_id: client.client_id,
      client_secret: client.client_secret,
      ...extra,
    },
    headers: { Accept: "application/json" },
    failOnStatusCode: false,
  });
}

function userinfo(
  method: "GET" | "POST",
  headers: Record<string, string>,
): Cypress.Chainable<Cypress.Response<UserinfoResponseBody>> {
  return cy.request<UserinfoResponseBody>({
    method,
    url: "/api/oidc/userinfo",
    headers,
    failOnStatusCode: false,
  });
}

describe("OIDC confidential client flow (management API only)", () => {
  it("redeems a code with client_secret_post, then serves userinfo and introspection", () => {
    createConfidentialClient().then((client) => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then(
          (ok: boolean) => expect(ok).to.be.true,
        );
        cy.request({
          method: "POST",
          url: `/api/apps/${client.client_id}/authorize`,
        }).then((response) => expect(response.status, "consent").to.eq(200));

        const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
        cy.wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
          PKCE_ProofKeyManager.createCodeChallenge(verifier),
          { log: false },
        ).then((challenge) => {
          cy.request({
            method: "POST",
            url: "/api/auth/session/generate-authorization-code",
            body: {
              client_app_id: client.client_id,
              code_challenge: challenge.code_challenge,
              code_challenge_method: "S256",
              challenge_time: challenge.challenge_time,
              redirect_uri: REDIRECT_URI,
              nonce: `e2e-nonce-${Date.now()}`,
              scope: SCOPE,
            },
          }).then((codeResponse) => {
            expect(codeResponse.status).to.eq(200);
            const code: string = codeResponse.body.authorization_code;
            cy.logout();

            cy.request<TokenResponseBody>({
              method: "POST",
              url: "/api/oidc/token",
              form: true,
              body: {
                grant_type: "authorization_code",
                client_id: client.client_id,
                client_secret: client.client_secret,
                code,
                code_verifier: verifier.code_verifier,
                redirect_uri: REDIRECT_URI,
              },
              headers: { Accept: "application/json" },
            }).then((tokenResponse) => {
              expect(tokenResponse.status, "token exchange").to.eq(200);
              expect(tokenResponse.body.token_type).to.eq("Bearer");
              expect(tokenResponse.body.scope).to.eq(SCOPE);
              expect(tokenResponse.body.id_token).to.be.a("string");
              const access_token = tokenResponse.body.access_token as string;
              const refresh_token = tokenResponse.body.refresh_token as string;
              expect(access_token).to.be.a("string");
              expect(refresh_token).to.be.a("string");

              const expectedSubPrefix = `${AUTH_APP_ID}|`;
              userinfo("GET", { Authorization: `Bearer ${access_token}` }).then(
                (response) => {
                  expect(response.status, "GET userinfo").to.eq(200);
                  expect(response.body.sub).to.match(
                    new RegExp(`^${expectedSubPrefix.replace("|", "\\|")}`),
                  );
                  expect(response.body.email).to.eq(credentials.email);
                  expect(response.body.email_verified).to.eq(false);
                },
              );
              userinfo("POST", { Authorization: `Bearer ${access_token}` }).then(
                (response) => {
                  expect(response.status, "POST userinfo").to.eq(200);
                  expect(response.body.email).to.eq(credentials.email);
                },
              );
              userinfo("GET", { Authorization: `Bearer ${refresh_token}` }).then(
                (response) => {
                  expect(response.status, "refresh token at userinfo").to.eq(401);
                  expect(response.body.error).to.eq("invalid_token");
                },
              );

              introspect(client, access_token).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body.active).to.eq(true);
                expect(response.body.client_id).to.eq(client.client_id);
                expect(response.body.token_type).to.eq("Bearer");
                expect(response.body.scope).to.eq(SCOPE);
                expect(response.body.sub).to.match(
                  new RegExp(`^${expectedSubPrefix.replace("|", "\\|")}`),
                );
                expect(response.body.exp).to.be.a("number");
                expect(response.body.iat).to.be.a("number");
                expect(response.body.iss).to.eq(
                  new URL(Cypress.env("AUTH_SERVER_URL")).origin,
                );
                expect(response.body.jti).to.be.a("string");
              });
              introspect(client, refresh_token, {
                token_type_hint: "refresh_token",
              }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body.active).to.eq(true);
                expect(response.body.client_id).to.eq(client.client_id);
              });

              // Another confidential client cannot learn about these tokens.
              createConfidentialClient(false).then((otherClient) => {
                introspect(otherClient, access_token).then((response) => {
                  expect(response.status).to.eq(200);
                  expect(response.body).to.deep.equal({ active: false });
                });
              });
            });
          });
        });
      });
    });
  });

  it("GET /api/oidc/userinfo rejects missing, malformed and undecodable bearer tokens", () => {
    userinfo("GET", {}).then((response) => {
      expect(response.status, "no Authorization header").to.eq(401);
      expect(response.body.error).to.eq("invalid_request");
      expect(response.headers["www-authenticate"]).to.eq("Bearer");
    });
    userinfo("GET", { Authorization: "Token abc" }).then((response) => {
      expect(response.status, "non-Bearer scheme").to.eq(401);
      expect(response.body.error).to.eq("invalid_token");
      expect(String(response.headers["www-authenticate"])).to.include("invalid_token");
    });
    userinfo("GET", { Authorization: "Bearer not-a-token" }).then((response) => {
      expect(response.status, "undecodable token").to.eq(401);
      expect(response.body.error).to.eq("invalid_token");
    });
  });
});
