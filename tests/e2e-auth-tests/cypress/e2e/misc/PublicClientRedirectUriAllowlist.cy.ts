// Pins which `redirect_uri` values a client app accepts when it has no
// explicit callback URL (auth-server/src/lib/oauth2/
// redirect-uri-validation-tier.ts):
//   - a public (PKCE-only) client accepts none, not even a path on its own
//     registered domain: an attacker starting the flow with their own code
//     verifier could otherwise point redirect_uri at any page of the
//     origin that leaks the URL and redeem a consented user's code;
//   - a confidential client (client secret) keeps the origin fallback,
//     since its code is useless without the secret;
//   - once a callback URL is registered, only that exact URL is accepted.
// Checked at GET /api/oidc/authorize (400 JSON vs. a 302 bridge to the
// login page) and at the POST /api/auth/login mint.

import { PKCE_ProofKeyManager, type CodeChallengeWithDetails } from "@schemavaults/auth-common";

interface OidcErrorBody {
  error?: string;
  error_description?: string;
}

interface LoginResponseBody {
  kind?: string;
  message?: string;
}

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

const CLIENT_ORIGIN = "https://public-client-allowlist.example";
const CALLBACK_URL = `${CLIENT_ORIGIN}/oidc/callback`;
// Any other page on the same origin, e.g. one hosting user content.
const LEAKY_PAGE_URL = `${CLIENT_ORIGIN}/user-content/leaky-page`;

function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function environment(): string {
  return Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test";
}

function createPkceChallenge(): Cypress.Chainable<CodeChallengeWithDetails> {
  const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
  return cy.wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
    PKCE_ProofKeyManager.createCodeChallenge(verifier),
    { log: false },
  );
}

/** Runs `fn` as the superuser, then signs out again. */
function asSuperuser(fn: () => void): void {
  cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
    if (!ok) throw new Error("Failed to login as superuser");
    fn();
    cy.logout();
  });
}

/** A public web app whose only redirect configuration is its domain. */
function createPublicAppWithDomainOnly(): Cypress.Chainable<string> {
  const app_id = `e2e-pub-${Math.random().toString(36).slice(2, 12)}`;
  asSuperuser(() => {
    cy.request({
      method: "POST",
      url: "/api/apps",
      body: {
        app_id,
        app_name: `Public client allowlist ${app_id}`,
        app_description: "PublicClientRedirectUriAllowlist.cy.ts",
        created_at: Date.now(),
        public: false,
        hardcoded: false,
        web: true,
        initial_domains: [{ domain: CLIENT_ORIGIN, environment: environment() }],
      },
    })
      .its("status")
      .should("eq", 200);
  });
  return cy.wrap(app_id, { log: false });
}

function authorize(
  client_id: string,
  redirect_uri: string,
): Cypress.Chainable<Cypress.Response<OidcErrorBody>> {
  return createPkceChallenge().then((challenge) =>
    cy.request<OidcErrorBody>({
      method: "GET",
      url: `/api/oidc/authorize?${new URLSearchParams({
        client_id,
        redirect_uri,
        response_type: "code",
        scope: "openid",
        code_challenge: challenge.code_challenge,
        code_challenge_method: "S256",
        state: `e2e-state-${Date.now()}`,
      }).toString()}`,
      followRedirect: false,
      failOnStatusCode: false,
    }),
  );
}

function expectAuthorizeRefused(client_id: string, redirect_uri: string, label: string): void {
  authorize(client_id, redirect_uri).then((response) => {
    expect(response.status, label).to.eq(400);
    expect(response.body.error, `${label}: error`).to.be.a("string").and.not.be.empty;
    // Never redirected to an unregistered redirect_uri.
    expect(response.headers["location"], `${label}: no redirect`).to.be.undefined;
  });
}

function expectAuthorizeBridged(client_id: string, redirect_uri: string, label: string): void {
  authorize(client_id, redirect_uri).then((response) => {
    expect(response.status, label).to.eq(302);
    const location = new URL(response.headers["location"] as string, Cypress.config("baseUrl")!);
    expect(location.pathname, `${label}: bridged to the login page`).to.eq("/auth/login");
  });
}

/**
 * POST /api/auth/login with credentials that do not exist: the
 * redirect_uri check runs first (400 "not registered"); a 401 means the
 * redirect_uri was accepted and only the credentials were refused.
 */
function loginMint(
  client_app_id: string,
  redirect_uri: string,
): Cypress.Chainable<Cypress.Response<LoginResponseBody>> {
  return createPkceChallenge().then((challenge) =>
    cy.request<LoginResponseBody>({
      method: "POST",
      url: "/api/auth/login",
      failOnStatusCode: false,
      body: {
        credentials: {
          email: `nobody-${Date.now()}@public-client-allowlist.example`,
          password: "NotARealPassword123!",
        },
        client_app_id,
        code_challenge: challenge.code_challenge,
        challenge_time: challenge.challenge_time,
        redirect_uri,
      },
    }),
  );
}

describe("redirect_uri allowlist of apps without callback URLs", () => {
  beforeEach(() => {
    cy.logout();
  });

  it("refuses every redirect_uri of a public client, even on its own domain", () => {
    createPublicAppWithDomainOnly().then((app_id) => {
      expectAuthorizeRefused(app_id, CALLBACK_URL, "callback path");
      expectAuthorizeRefused(app_id, LEAKY_PAGE_URL, "other path on the domain");
      loginMint(app_id, LEAKY_PAGE_URL).then((response) => {
        expect(response.status, "login mint").to.eq(400);
        expect(String(response.body.message)).to.include("not registered");
      });
    });
  });

  it("keeps the origin fallback only while the app is a confidential client", () => {
    createPublicAppWithDomainOnly().then((app_id) => {
      asSuperuser(() => {
        cy.request({ method: "POST", url: `/api/apps/${app_id}/client-secret` })
          .its("status")
          .should("eq", 200);
      });
      expectAuthorizeBridged(app_id, LEAKY_PAGE_URL, "confidential: any path on the domain");
      expectAuthorizeRefused(app_id, "https://evil.example/cb", "confidential: other origin");

      // Back to a public client: the fallback goes with the secret.
      asSuperuser(() => {
        cy.request({ method: "DELETE", url: `/api/apps/${app_id}/client-secret` })
          .its("status")
          .should("eq", 200);
      });
      expectAuthorizeRefused(app_id, LEAKY_PAGE_URL, "public again");
    });
  });

  it("accepts exactly the registered callback URL once there is one", () => {
    createPublicAppWithDomainOnly().then((app_id) => {
      asSuperuser(() => {
        cy.request({
          method: "POST",
          url: `/api/apps/${app_id}/callback-urls`,
          body: {
            app_callback_url_ref_id: generateV4Uuid(),
            app_id,
            callback_url: CALLBACK_URL,
            environment: environment(),
            created_at: Date.now(),
          },
        })
          .its("status")
          .should("eq", 200);
      });
      expectAuthorizeBridged(app_id, CALLBACK_URL, "registered callback URL");
      expectAuthorizeRefused(app_id, LEAKY_PAGE_URL, "other path on the domain");
      loginMint(app_id, LEAKY_PAGE_URL).then((response) => {
        expect(response.status, "login mint, other path").to.eq(400);
      });
      loginMint(app_id, CALLBACK_URL).then((response) => {
        // Past the redirect_uri check: only the credentials are refused.
        expect(response.status, "login mint, registered callback URL").to.eq(401);
      });
    });
  });
});
