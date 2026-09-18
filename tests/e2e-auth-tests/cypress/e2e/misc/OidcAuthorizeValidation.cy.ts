// The validation matrix of GET /api/oidc/authorize (auth-server/src/lib/oidc/
// validate-authorize-request.ts). Only the happy-path bridge and the
// malformed-scope redirect were covered before. Errors fall in two classes:
//   - before a trustworthy redirect_uri is known -> direct 400 JSON
//     ({ error, error_description }), never a redirect
//   - afterwards -> 302 back to the registered redirect_uri carrying
//     `error`, `error_description`, the echoed `state` and RFC 9207 `iss`
// The client app is registered here by request, so the spec runs in the
// misc suite without the example resource server.

import { PKCE_ProofKeyManager, type CodeChallengeWithDetails } from "@schemavaults/auth-common";

interface OidcErrorBody {
  error?: string;
  error_description?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const CLIENT_ORIGIN = "https://authorize-validation.example";
const REDIRECT_URI = `${CLIENT_ORIGIN}/oidc/callback`;

function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Superuser registers a public web app with the client origin as a domain. */
function registerClientApp(): Cypress.Chainable<string> {
  const app_id = `e2e-authz-${Math.random().toString(36).slice(2, 12)}`;
  return cy
    .create_and_login_as_superuser_via_request()
    .then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
      cy.request({
        method: "POST",
        url: "/api/apps",
        body: {
          app_id,
          app_name: `Authorize validation ${app_id}`,
          app_description: "OidcAuthorizeValidation.cy.ts",
          created_at: Date.now(),
          public: true,
          hardcoded: false,
          web: true,
        },
      }).then((response) => expect(response.status).to.eq(200));
      cy.request({
        method: "POST",
        url: `/api/apps/${app_id}/domains`,
        body: {
          app_domain_ref_id: generateV4Uuid(),
          app_id,
          domain: CLIENT_ORIGIN,
          environment: Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test",
          created_at: Date.now(),
          hardcoded: false,
        },
      }).then((response) => expect(response.status).to.eq(200));
      cy.logout();
      return cy.wrap(app_id, { log: false });
    });
}

type ParamOverrides = Record<string, string | null>;

/** GET /api/oidc/authorize with a valid request, then `overrides` applied (null deletes). */
function authorize(
  client_id: string,
  overrides: ParamOverrides,
): Cypress.Chainable<Cypress.Response<OidcErrorBody>> {
  const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
  return cy
    .wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
      PKCE_ProofKeyManager.createCodeChallenge(verifier),
      { log: false },
    )
    .then((challenge) => {
      const params: Record<string, string> = {
        client_id,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: "openid",
        code_challenge: challenge.code_challenge,
        code_challenge_method: "S256",
        state: `e2e-state-${Date.now()}`,
      };
      for (const [key, value] of Object.entries(overrides)) {
        if (value === null) delete params[key];
        else params[key] = value;
      }
      return cy.request<OidcErrorBody>({
        method: "GET",
        url: `/api/oidc/authorize?${new URLSearchParams(params).toString()}`,
        followRedirect: false,
        failOnStatusCode: false,
      });
    });
}

describe("GET /api/oidc/authorize validation", () => {
  let client_id = "";

  before(() => {
    registerClientApp().then((app_id) => {
      client_id = app_id;
    });
  });

  it("bridges a valid request to the login page", () => {
    authorize(client_id, {}).then((response) => {
      expect(response.status).to.eq(302);
      const location = new URL(response.headers["location"] as string, Cypress.config("baseUrl")!);
      expect(location.pathname).to.eq("/auth/login");
    });
  });

  describe("errors answered directly (no trustworthy redirect_uri yet)", () => {
    const directCases: Array<{ label: string; overrides: ParamOverrides }> = [
      { label: "missing client_id", overrides: { client_id: null } },
      { label: "unknown client_id", overrides: { client_id: "e2e-unknown-client-xyz" } },
      { label: "missing redirect_uri", overrides: { redirect_uri: null } },
      { label: "redirect_uri that is not a URL", overrides: { redirect_uri: "not a url" } },
      { label: "unregistered redirect_uri", overrides: { redirect_uri: "https://evil.example/cb" } },
      { label: "malformed state", overrides: { state: "s".repeat(2000) } },
    ];
    for (const { label, overrides } of directCases) {
      it(`returns 400 JSON for ${label}`, () => {
        authorize(client_id, overrides).then((response) => {
          expect(response.status).to.eq(400);
          expect(response.body.error).to.be.a("string").and.not.be.empty;
          expect(response.body.error_description).to.be.a("string").and.not.be.empty;
          expect(response.headers["location"]).to.be.undefined;
        });
      });
    }
  });

  describe("errors redirected back to the registered redirect_uri", () => {
    const redirectCases: Array<{ label: string; overrides: ParamOverrides; error: string }> = [
      { label: "the request parameter (JAR)", overrides: { request: "x" }, error: "request_not_supported" },
      { label: "the request_uri parameter", overrides: { request_uri: "x" }, error: "request_uri_not_supported" },
      { label: "response_type other than code", overrides: { response_type: "token" }, error: "unsupported_response_type" },
      { label: "a missing code_challenge_method", overrides: { code_challenge_method: null }, error: "invalid_request" },
      { label: "code_challenge_method=plain", overrides: { code_challenge_method: "plain" }, error: "invalid_request" },
      { label: "a missing code_challenge", overrides: { code_challenge: null }, error: "invalid_request" },
      { label: "a malformed nonce", overrides: { nonce: "n".repeat(2000) }, error: "invalid_request" },
      { label: "prompt=none", overrides: { prompt: "none" }, error: "login_required" },
    ];
    for (const { label, overrides, error } of redirectCases) {
      it(`redirects with error=${error} for ${label}`, () => {
        authorize(client_id, overrides).then((response) => {
          expect(response.status).to.eq(302);
          const location = new URL(response.headers["location"] as string);
          expect(location.origin).to.eq(CLIENT_ORIGIN);
          expect(location.pathname).to.eq("/oidc/callback");
          expect(location.searchParams.get("error")).to.eq(error);
          expect(location.searchParams.get("error_description")).to.be.a("string").and.not.be.empty;
          expect(location.searchParams.get("state")).to.match(/^e2e-state-/);
          expect(location.searchParams.get("iss"), "RFC 9207 iss").to.eq(
            new URL(Cypress.env("AUTH_SERVER_URL")).origin,
          );
        });
      });
    }
  });
});
