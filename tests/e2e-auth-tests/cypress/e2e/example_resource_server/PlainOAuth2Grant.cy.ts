// PlainOAuth2Grant.cy.ts
//
// Covers authorization requests WITHOUT the `openid` scope — plain
// OAuth 2.1 grants (RFC 6749 §3.3 makes `scope` OPTIONAL; OIDC Core
// §3.1.2.1 leaves requests without `openid` to OAuth semantics). That is
// what OAuth-only clients such as MCP clients send: they want an access
// token for a resource server, not an identity, and they request the
// scopes advertised by that resource (or none at all).
//
// The auth server must:
//   - accept such a request at GET /api/oidc/authorize and bridge to the
//     login UI with NO `scope` parameter (only a malformed value is an
//     `invalid_scope` error);
//   - bind a null scope to the minted authorization code;
//   - redeem it at POST /api/oidc/token for access + refresh tokens with
//     NO id_token and NO `scope` field (nothing was granted);
//   - rotate such a refresh token like any other, still without an
//     id_token, and refuse a refresh that tries to widen into `openid`;
//   - refuse the resulting access token at /api/oidc/userinfo with
//     `insufficient_scope` (RFC 6750 §3.1): no OpenID authentication
//     took place, so there are no identity claims to return.
//
// An OpenID request (`scope=openid …`) through the same code path is
// asserted as a control so a regression that drops id_tokens everywhere
// cannot pass.
//
// The public (PKCE-only) example-resource-server app is seeded in
// cypress.config.ts's before:run hook with the example app's origin as
// its registered domain, so any path on that origin is a valid
// redirect_uri.

import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

describe("Plain OAuth 2.1 grants (authorization requests without `openid`)", () => {
  const AUTHORIZE_ENDPOINT = "/api/oidc/authorize";
  const TOKEN_ENDPOINT = "/api/oidc/token";
  const USERINFO_ENDPOINT = "/api/oidc/userinfo";

  // The app id seeded for the example resource server in
  // cypress.config.ts's before:run hook (a public client).
  const CLIENT_ID = "00000000-0000-0000-0000-000000000000";

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const REDIRECT_URI = `${new URL(exampleAppUrl).origin}/oauth2/callback`;

  interface OidcTokenResponseBody {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    scope?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  }

  interface MintedAuthorizationCode {
    code: string;
    code_verifier: string;
  }

  function createPkcePair(): Cypress.Chainable<{
    code_verifier: string;
    challenge: CodeChallengeWithDetails;
  }> {
    const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
    return cy
      .wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
        PKCE_ProofKeyManager.createCodeChallenge(verifier),
        { log: false },
      )
      .then((challenge) => ({
        code_verifier: verifier.code_verifier,
        challenge,
      }));
  }

  /**
   * GET /api/oidc/authorize without following the redirect, so the
   * bridge URL (or the error redirect back to the client) can be
   * inspected. `scope` is sent verbatim when given; `undefined` omits it.
   */
  function probeAuthorizeEndpoint(
    scope: string | undefined,
  ): Cypress.Chainable<Cypress.Response<unknown>> {
    return createPkcePair().then(({ challenge }) => {
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        code_challenge: challenge.code_challenge,
        code_challenge_method: "S256",
        state: `e2e-state-${Date.now()}`,
      });
      if (scope !== undefined) {
        params.set("scope", scope);
      }
      return cy.request({
        method: "GET",
        url: `${AUTHORIZE_ENDPOINT}?${params.toString()}`,
        followRedirect: false,
        failOnStatusCode: false,
      });
    });
  }

  function redirectLocation(response: Cypress.Response<unknown>): URL {
    expect(response.status, "authorize status").to.equal(302);
    const location = response.headers["location"];
    expect(location, "Location header").to.be.a("string");
    return new URL(location as string);
  }

  /**
   * Mints an authorization code for the example app through the login
   * API with a PKCE pair generated here (so the spec can redeem it).
   * `scope` is omitted from the body entirely when undefined — the
   * server binds a null scope (plain OAuth 2.1 grant).
   */
  function mintAuthorizationCode(opts: {
    email: string;
    password: string;
    scope?: string;
  }): Cypress.Chainable<MintedAuthorizationCode> {
    return createPkcePair().then(({ code_verifier, challenge }) =>
      cy
        .request({
          method: "POST",
          url: "/api/auth/login",
          failOnStatusCode: false,
          body: {
            credentials: { email: opts.email, password: opts.password },
            client_app_id: CLIENT_ID,
            code_challenge: challenge.code_challenge,
            challenge_time: challenge.challenge_time,
            redirect_uri: REDIRECT_URI,
            ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
          },
        })
        .then((response) => {
          expect(response.status, "login status").to.equal(200);
          const body = response.body as {
            kind?: string;
            authorization_code?: string;
          };
          expect(body.kind, "login kind").to.equal("authenticated");
          expect(body.authorization_code, "authorization_code").to.be.a(
            "string",
          );
          return {
            code: body.authorization_code as string,
            code_verifier,
          };
        }),
    );
  }

  function postTokenRequest(
    params: Record<string, string>,
  ): Cypress.Chainable<Cypress.Response<OidcTokenResponseBody>> {
    return cy.request<OidcTokenResponseBody>({
      method: "POST",
      url: TOKEN_ENDPOINT,
      form: true,
      body: { client_id: CLIENT_ID, ...params },
      headers: { Accept: "application/json" },
      failOnStatusCode: false,
    });
  }

  function expectPlainOAuthTokenSet(
    response: Cypress.Response<OidcTokenResponseBody>,
    label: string,
  ): void {
    expect(response.status, `${label}: status`).to.equal(200);
    expect(response.body.token_type, `${label}: token_type`).to.equal(
      "Bearer",
    );
    expect(response.body.access_token, `${label}: access_token`).to.be.a(
      "string",
    ).and.not.be.empty;
    expect(response.body.refresh_token, `${label}: refresh_token`).to.be.a(
      "string",
    ).and.not.be.empty;
    expect(response.body.expires_in, `${label}: expires_in`).to.be.a("number");
    // Nothing was granted: no id_token (no OpenID authentication took
    // place) and no `scope` field (the wire format has no empty form).
    expect(response.body.id_token, `${label}: id_token`).to.be.undefined;
    expect(response.body.scope, `${label}: scope`).to.be.undefined;
  }

  /**
   * Creates a fresh user, signs them in (session cookie), and records
   * their consent for the example app — the OIDC code grant refuses
   * codes for apps the user has not authorized.
   */
  function createUserAuthorizedForExampleApp(): Cypress.Chainable<{
    email: string;
    password: string;
  }> {
    return cy.generate_random_test_user_credentials().then((credentials) =>
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success, "create_and_login_as_regular_user should succeed").to
          .be.true;
        return cy
          .request({
            method: "POST",
            url: `/api/apps/${CLIENT_ID}/authorize`,
            body: {},
          })
          .then((response) => {
            expect(response.status, "app authorization status").to.equal(200);
            return credentials;
          });
      }),
    );
  }

  beforeEach(() => {
    cy.reset_rate_limit();
  });

  describe("GET /api/oidc/authorize", () => {
    it("accepts a request with no scope and bridges to the login UI without one", () => {
      probeAuthorizeEndpoint(undefined).then((response) => {
        const bridge = redirectLocation(response);
        expect(bridge.pathname, "bridge path").to.equal("/auth/login");
        expect(bridge.searchParams.get("app_id"), "app_id").to.equal(
          CLIENT_ID,
        );
        expect(bridge.searchParams.get("redirect_uri"), "redirect_uri").to.equal(
          REDIRECT_URI,
        );
        expect(bridge.searchParams.has("scope"), "scope forwarded").to.be
          .false;
      });
    });

    it("treats a scope naming only unknown values as a plain OAuth grant", () => {
      // An MCP client requests the scopes its resource server advertises;
      // none of them are OIDC scopes. RFC 6749 §3.3 lets the server
      // ignore unknown scopes rather than fail.
      probeAuthorizeEndpoint("mcp:tools mcp:resources").then((response) => {
        const bridge = redirectLocation(response);
        expect(bridge.pathname, "bridge path").to.equal("/auth/login");
        expect(bridge.searchParams.has("scope"), "scope forwarded").to.be
          .false;
      });
    });

    it("still forwards an OpenID scope to the login UI", () => {
      probeAuthorizeEndpoint("openid email").then((response) => {
        const bridge = redirectLocation(response);
        expect(bridge.pathname, "bridge path").to.equal("/auth/login");
        expect(bridge.searchParams.get("scope"), "scope forwarded").to.equal(
          "openid email",
        );
      });
    });

    it("rejects a malformed scope with invalid_scope instead of reading it as no scope", () => {
      // A tab is not a valid separator (RFC 6749 §3.3 scope-token grammar).
      probeAuthorizeEndpoint("openid\temail").then((response) => {
        const target = redirectLocation(response);
        expect(target.origin + target.pathname, "error redirect target").to.equal(
          REDIRECT_URI,
        );
        expect(target.searchParams.get("error"), "error").to.equal(
          "invalid_scope",
        );
      });
    });
  });

  describe("POST /api/oidc/token", () => {
    it("redeems a code minted without a scope for access + refresh tokens and no id_token", () => {
      createUserAuthorizedForExampleApp().then(({ email, password }) => {
        mintAuthorizationCode({ email, password }).then(
          ({ code, code_verifier }) => {
            postTokenRequest({
              grant_type: "authorization_code",
              code,
              code_verifier,
              redirect_uri: REDIRECT_URI,
            }).then((codeResponse) => {
              expectPlainOAuthTokenSet(codeResponse, "code grant");
              const access_token = codeResponse.body.access_token as string;
              const refresh_token = codeResponse.body.refresh_token as string;

              // No OpenID authentication took place, so the token carries
              // no identity: userinfo refuses it with insufficient_scope
              // (RFC 6750 §3.1) rather than returning `sub`.
              cy.request({
                method: "GET",
                url: USERINFO_ENDPOINT,
                headers: { Authorization: `Bearer ${access_token}` },
                failOnStatusCode: false,
              }).then((userinfoResponse) => {
                expect(userinfoResponse.status, "userinfo status").to.equal(
                  403,
                );
                expect(
                  (userinfoResponse.body as { error?: string }).error,
                  "userinfo error",
                ).to.equal("insufficient_scope");
                expect(
                  userinfoResponse.headers["www-authenticate"],
                  "WWW-Authenticate",
                ).to.include('error="insufficient_scope"');
              });

              // The refresh token rotates like any other, still without
              // an id_token or a scope.
              postTokenRequest({
                grant_type: "refresh_token",
                refresh_token,
              }).then((refreshResponse) => {
                expectPlainOAuthTokenSet(refreshResponse, "refresh grant");
                expect(
                  refreshResponse.body.refresh_token,
                  "rotated refresh_token",
                ).to.not.equal(refresh_token);
                const rotated_refresh_token = refreshResponse.body
                  .refresh_token as string;

                // RFC 6749 §6: a refresh may only narrow the original
                // grant; widening a plain OAuth grant into OpenID is
                // refused.
                postTokenRequest({
                  grant_type: "refresh_token",
                  refresh_token: rotated_refresh_token,
                  scope: "openid",
                }).then((widenResponse) => {
                  expect(widenResponse.status, "widen: status").to.equal(400);
                  expect(widenResponse.body.error, "widen: error").to.equal(
                    "invalid_scope",
                  );
                  expect(widenResponse.body.access_token, "widen: access_token")
                    .to.be.undefined;
                });
              });
            });
          },
        );
      });
    });

    it("control: a code minted with `openid` still returns an id_token and the granted scope", () => {
      createUserAuthorizedForExampleApp().then(({ email, password }) => {
        mintAuthorizationCode({ email, password, scope: "openid email" }).then(
          ({ code, code_verifier }) => {
            postTokenRequest({
              grant_type: "authorization_code",
              code,
              code_verifier,
              redirect_uri: REDIRECT_URI,
            }).then((response) => {
              expect(response.status, "status").to.equal(200);
              expect(response.body.id_token, "id_token").to.be.a("string").and
                .not.be.empty;
              expect(response.body.scope, "scope").to.equal("openid email");
              const access_token = response.body.access_token as string;

              cy.request({
                method: "GET",
                url: USERINFO_ENDPOINT,
                headers: { Authorization: `Bearer ${access_token}` },
              }).then((userinfoResponse) => {
                expect(userinfoResponse.status, "userinfo status").to.equal(
                  200,
                );
                expect(
                  (userinfoResponse.body as { email?: string }).email,
                  "userinfo email",
                ).to.equal(email);
              });
            });
          },
        );
      });
    });
  });
});
