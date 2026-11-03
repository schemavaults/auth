// OidcTokenRevocation.cy.ts
//
// The OAuth 2.0 token revocation endpoint
// (auth-server/src/app/api/oidc/revoke/route.ts, RFC 7009) and its
// registration in the discovery document. No browser flow is involved:
// tokens are minted through the login API and the token endpoint, then
// revoked with cy.request.
//
// What the endpoint must do:
//   - authenticate clients as the token endpoint does: a confidential
//     client with its secret, a public client by `client_id` alone;
//   - revoke a refresh token issued to the client together with the access
//     token minted alongside it, and an `oidc-userinfo` access token on its
//     own;
//   - answer 200 for anything that is not a live token (§2.2), refuse a
//     live token of another client (`invalid_grant`, §2.1) and an access
//     token minted for an API server (`unsupported_token_type`, §2.2.1).
//
// Both apps are seeded in cypress.config.ts's before:run hook: the public
// (PKCE-only) example app, whose id is also the example API server's, and
// the confidential one.

import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

describe("OIDC token revocation endpoint (RFC 7009)", () => {
  const REVOCATION_ENDPOINT = "/api/oidc/revoke";
  const TOKEN_ENDPOINT = "/api/oidc/token";
  const INTROSPECTION_ENDPOINT = "/api/oidc/introspect";
  const USERINFO_ENDPOINT = "/api/oidc/userinfo";
  const DISCOVERY_ENDPOINT = "/.well-known/openid-configuration";

  /** RFC 6749 §5.2 challenge sent with every failed-authentication 401. */
  const EXPECTED_WWW_AUTHENTICATE =
    'Basic realm="oauth2/token", charset="UTF-8"';

  const confidentialClientId: string = Cypress.env(
    "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID",
  );
  const confidentialClientSecret: string = Cypress.env(
    "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET",
  );

  // The public example app, and the example API server (same id).
  const PUBLIC_CLIENT_ID = "00000000-0000-0000-0000-000000000000";
  const EXAMPLE_API_SERVER_ID = "00000000-0000-0000-0000-000000000000";
  // A well-formed app id that no app is registered under.
  const UNKNOWN_CLIENT_ID = "9e1c6f2a-5b7d-4c3e-8a9f-0d2b4c6e8f10";

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const REDIRECT_URI = `${new URL(exampleAppUrl).origin}/oauth2/callback`;

  interface OAuthErrorBody {
    error?: string;
    error_description?: string;
  }

  interface TokenResponseBody extends OAuthErrorBody {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
  }

  /**
   * HTTP Basic credentials per RFC 6749 §2.3.1: client_id and
   * client_secret are form-urlencoded before being base64-encoded.
   */
  function basicHeader(client_id: string, client_secret: string): string {
    return `Basic ${btoa(
      `${encodeURIComponent(client_id)}:${encodeURIComponent(client_secret)}`,
    )}`;
  }

  const confidentialBasic = (): string =>
    basicHeader(confidentialClientId, confidentialClientSecret);

  function revoke(
    form: Record<string, string>,
    authorization?: string,
  ): Cypress.Chainable<Cypress.Response<OAuthErrorBody | string>> {
    return cy.request<OAuthErrorBody | string>({
      method: "POST",
      url: REVOCATION_ENDPOINT,
      form: true,
      failOnStatusCode: false,
      headers: authorization ? { Authorization: authorization } : {},
      body: form,
    });
  }

  function expectRevoked(
    response: Cypress.Response<OAuthErrorBody | string>,
    label: string,
  ): void {
    expect(response.status, `${label}: status`).to.equal(200);
    // §2.2: the client ignores the body; the endpoint sends none.
    expect(response.body ?? "", `${label}: empty body`).to.equal("");
    expect(response.headers["cache-control"], `${label}: Cache-Control`).to.contain(
      "no-store",
    );
  }

  function expectRefused(
    response: Cypress.Response<OAuthErrorBody | string>,
    status: 400 | 401,
    error: string,
    error_description: string,
  ): void {
    expect(response.status, "status").to.equal(status);
    const body = response.body as OAuthErrorBody;
    expect(body.error, "error").to.equal(error);
    expect(body.error_description, "error_description").to.equal(
      error_description,
    );
    if (status === 401) {
      expect(
        response.headers["www-authenticate"],
        "WWW-Authenticate header",
      ).to.equal(EXPECTED_WWW_AUTHENTICATE);
    }
  }

  function postTokenRequest(
    params: Record<string, string>,
  ): Cypress.Chainable<Cypress.Response<TokenResponseBody>> {
    return cy.request<TokenResponseBody>({
      method: "POST",
      url: TOKEN_ENDPOINT,
      form: true,
      body: { client_id: PUBLIC_CLIENT_ID, ...params },
      headers: { Accept: "application/json" },
      failOnStatusCode: false,
    });
  }

  function userinfoStatus(access_token: string): Cypress.Chainable<number> {
    return cy
      .request({
        method: "GET",
        url: USERINFO_ENDPOINT,
        headers: { Authorization: `Bearer ${access_token}` },
        failOnStatusCode: false,
      })
      .its("status");
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
   * Creates a fresh user with a verified e-mail address who authorized the
   * public example app, mints an authorization code for it through the
   * login API and redeems it (optionally for an API server, `resource`).
   */
  function signInToPublicApp(
    resource?: string,
  ): Cypress.Chainable<{ access_token: string; refresh_token: string }> {
    return cy.generate_random_test_user_credentials().then((credentials) =>
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success, "create_and_login_as_regular_user should succeed").to
          .be.true;
        cy.verify_email_via_request(credentials.email).then(
          (verified: boolean) => {
            expect(verified, "email verified").to.be.true;
          },
        );
        cy.request({
          method: "POST",
          url: `/api/apps/${PUBLIC_CLIENT_ID}/authorize`,
          body: {},
        })
          .its("status")
          .should("equal", 200);
        return createPkcePair().then(({ code_verifier, challenge }) =>
          cy
            .request({
              method: "POST",
              url: "/api/auth/login",
              body: {
                credentials: {
                  email: credentials.email,
                  password: credentials.password,
                },
                client_app_id: PUBLIC_CLIENT_ID,
                code_challenge: challenge.code_challenge,
                challenge_time: challenge.challenge_time,
                redirect_uri: REDIRECT_URI,
                scope: "openid email",
              },
            })
            .then((login) => {
              const body = login.body as {
                kind?: string;
                authorization_code?: string;
              };
              expect(body.kind, "login kind").to.equal("authenticated");
              return postTokenRequest({
                grant_type: "authorization_code",
                code: body.authorization_code as string,
                code_verifier,
                redirect_uri: REDIRECT_URI,
                ...(resource ? { resource } : {}),
              });
            })
            .then((response) => {
              expect(response.status, "code grant status").to.equal(200);
              return {
                access_token: response.body.access_token as string,
                refresh_token: response.body.refresh_token as string,
              };
            }),
        );
      }),
    );
  }

  /** A service-account access token of the confidential client (client_credentials). */
  function mintServiceAccountToken(): Cypress.Chainable<string> {
    return cy
      .request<TokenResponseBody>({
        method: "POST",
        url: TOKEN_ENDPOINT,
        form: true,
        headers: { Authorization: confidentialBasic() },
        body: { grant_type: "client_credentials" },
      })
      .then((response) => {
        expect(response.status, "client_credentials status").to.equal(200);
        return response.body.access_token as string;
      });
  }

  function isActive(token: string): Cypress.Chainable<boolean> {
    return cy
      .request<{ active: boolean }>({
        method: "POST",
        url: INTROSPECTION_ENDPOINT,
        form: true,
        headers: { Authorization: confidentialBasic() },
        body: { token },
      })
      .its("body.active");
  }

  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("advertises the revocation endpoint in the discovery document", () => {
    cy.request<{
      issuer?: string;
      revocation_endpoint?: string;
      revocation_endpoint_auth_methods_supported?: string[];
    }>({ method: "GET", url: DISCOVERY_ENDPOINT }).then((response) => {
      expect(response.status, "status").to.equal(200);
      expect(response.body.revocation_endpoint, "revocation_endpoint").to.equal(
        `${response.body.issuer}${REVOCATION_ENDPOINT}`,
      );
      // As at the token endpoint: public clients ("none") may revoke their
      // own tokens.
      expect(
        response.body.revocation_endpoint_auth_methods_supported,
        "revocation_endpoint_auth_methods_supported",
      ).to.deep.equal(["none", "client_secret_basic", "client_secret_post"]);
    });
  });

  describe("client authentication", () => {
    it("rejects a request that identifies no client", () => {
      revoke({ token: "probe" }).then((response) => {
        expectRefused(
          response,
          401,
          "invalid_client",
          "Missing or malformed 'client_id' parameter.",
        );
      });
    });

    it("rejects an unknown client", () => {
      revoke({ token: "probe", client_id: UNKNOWN_CLIENT_ID }).then(
        (response) => {
          expectRefused(response, 401, "invalid_client", "Unknown client.");
        },
      );
    });

    it("rejects a confidential client that presents no secret", () => {
      revoke({ token: "probe", client_id: confidentialClientId }).then(
        (response) => {
          expectRefused(
            response,
            401,
            "invalid_client",
            "Client authentication is required for this client (client_secret_basic or client_secret_post).",
          );
        },
      );
    });

    it("rejects a wrong client secret", () => {
      revoke(
        { token: "probe" },
        basicHeader(confidentialClientId, `${confidentialClientSecret}-wrong`),
      ).then((response) => {
        expectRefused(response, 401, "invalid_client", "Invalid client credentials.");
      });
    });

    it("rejects a client secret sent for a public client", () => {
      revoke({
        token: "probe",
        client_id: PUBLIC_CLIENT_ID,
        client_secret: "not-a-secret",
      }).then((response) => {
        expectRefused(
          response,
          401,
          "invalid_client",
          "This client has no client secret registered; do not send client credentials.",
        );
      });
    });

    it("requires the 'token' parameter", () => {
      revoke({ client_id: PUBLIC_CLIENT_ID }).then((response) => {
        expectRefused(
          response,
          400,
          "invalid_request",
          "Missing 'token' parameter.",
        );
      });
    });
  });

  it("answers a token that is not a live token with 200 (§2.2)", () => {
    revoke({ token: "not-a-real-token", client_id: PUBLIC_CLIENT_ID }).then(
      (response) => expectRevoked(response, "public client"),
    );
    revoke({ token: "not-a-real-token" }, confidentialBasic()).then(
      (response) => expectRevoked(response, "confidential client"),
    );
  });

  it("revokes a service account access token, and only for the client it was issued to", () => {
    mintServiceAccountToken().then((access_token) => {
      isActive(access_token).should("equal", true);

      // Another client cannot revoke it (§2.1).
      revoke({ token: access_token, client_id: PUBLIC_CLIENT_ID }).then(
        (response) => {
          expectRefused(
            response,
            400,
            "invalid_grant",
            "The token was not issued to this client.",
          );
        },
      );
      isActive(access_token).should("equal", true);

      revoke({ token: access_token, token_type_hint: "access_token" }, confidentialBasic()).then(
        (response) => expectRevoked(response, "revoke"),
      );
      isActive(access_token).should("equal", false);

      // Revoking again changes nothing and is still a 200.
      revoke(
        {
          token: access_token,
          client_id: confidentialClientId,
          client_secret: confidentialClientSecret,
        },
      ).then((response) => expectRevoked(response, "revoke again"));
    });
  });

  it("revokes a public client's refresh token together with the access token minted alongside it", () => {
    signInToPublicApp().then(({ access_token, refresh_token }) => {
      userinfoStatus(access_token).should("equal", 200);

      revoke({
        token: refresh_token,
        token_type_hint: "refresh_token",
        client_id: PUBLIC_CLIENT_ID,
      }).then((response) => expectRevoked(response, "revoke"));

      postTokenRequest({ grant_type: "refresh_token", refresh_token }).then(
        (response) => {
          expect(response.status, "refresh status").to.equal(400);
          expect(response.body.error, "refresh error").to.equal(
            "invalid_grant",
          );
        },
      );
      userinfoStatus(access_token).should("equal", 401);
    });
  });

  it("revokes an access token on its own, leaving the refresh token usable", () => {
    signInToPublicApp().then(({ access_token, refresh_token }) => {
      revoke({ token: access_token, client_id: PUBLIC_CLIENT_ID }).then(
        (response) => expectRevoked(response, "revoke"),
      );
      userinfoStatus(access_token).should("equal", 401);

      postTokenRequest({ grant_type: "refresh_token", refresh_token })
        .its("status")
        .should("equal", 200);
    });
  });

  it("answers an access token minted for an API server with unsupported_token_type", () => {
    signInToPublicApp(EXAMPLE_API_SERVER_ID).then(({ access_token }) => {
      revoke({ token: access_token, client_id: PUBLIC_CLIENT_ID }).then(
        (response) => {
          expectRefused(
            response,
            400,
            "unsupported_token_type",
            "Access tokens minted for an API server cannot be revoked here; revoke the refresh token they were issued with.",
          );
        },
      );
    });
  });
});
