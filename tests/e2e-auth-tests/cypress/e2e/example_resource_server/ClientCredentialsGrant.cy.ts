// ClientCredentialsGrant.cy.ts
//
// The OAuth2 client credentials grant (RFC 6749 §4.4) at
// POST /api/oidc/token: machine-to-machine access tokens for a
// confidential client's SERVICE ACCOUNT (auth-server/src/app/api/oidc/
// token/client_credentials_grant.ts + lib/auth-db/apps/app-registry/
// app-service-accounts.ts).
//
// No browser flow is involved — there is no end user. Every case is a
// direct cy.request against the token endpoint, the introspection
// endpoint (to look inside the opaque JWE access token), userinfo (which
// refuses M2M tokens: no end user was authenticated), the
// example resource server's /api/* routes (to prove the token is
// accepted by a resource server, as a real M2M caller would use it), and
// the service-account management API.
//
// Both apps are seeded in cypress.config.ts's before:run hook: the
// public (PKCE-only) app, and the confidential one (client secret
// registered, and connected to the example resource server's API so it
// may request `resource` tokens for it).

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

interface TokenResponseBody {
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

interface IntrospectionResponseBody {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  sub?: string;
  aud?: string;
  iss?: string;
}

interface UserinfoResponseBody {
  error?: string;
}

interface ServiceAccountResponseBody {
  success: boolean;
  service_account?: {
    uid: string;
    email: string;
    created_at: number;
    disabled: boolean;
  } | null;
  has_client_secret?: boolean;
  message?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("OAuth2 client credentials grant (RFC 6749 §4.4)", () => {
  const TOKEN_ENDPOINT = "/api/oidc/token";
  const INTROSPECTION_ENDPOINT = "/api/oidc/introspect";
  const USERINFO_ENDPOINT = "/api/oidc/userinfo";
  const DISCOVERY_ENDPOINT = "/.well-known/openid-configuration";

  const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

  const confidentialClientId: string = Cypress.env(
    "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID",
  );
  const confidentialClientSecret: string = Cypress.env(
    "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET",
  );

  // The public (no client secret) app the rest of this suite drives, and
  // the example resource server's API server id (the same value).
  const publicClientId = "00000000-0000-0000-0000-000000000000";
  const exampleApiServerId = "00000000-0000-0000-0000-000000000000";

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;

  /** The service account's synthetic email (see app-service-accounts.ts). */
  const expectedServiceAccountEmail = `${confidentialClientId}@service-accounts.invalid`;

  /**
   * HTTP Basic credentials per RFC 6749 §2.3.1: client_id and
   * client_secret are form-urlencoded before being base64-encoded.
   */
  function basicHeader(client_id: string, client_secret: string): string {
    const encoded: string = btoa(
      `${encodeURIComponent(client_id)}:${encodeURIComponent(client_secret)}`,
    );
    return `Basic ${encoded}`;
  }

  interface GrantOptions {
    /** Extra form fields (scope, resource, client_secret, ...). */
    form?: Record<string, string>;
    /** Authorization header value; defaults to the confidential client's Basic credentials. */
    authorization?: string | null;
  }

  function requestClientCredentialsGrant(
    options: GrantOptions = {},
  ): Cypress.Chainable<Cypress.Response<TokenResponseBody>> {
    const authorization: string | null =
      options.authorization === undefined
        ? basicHeader(confidentialClientId, confidentialClientSecret)
        : options.authorization;
    return cy.request<TokenResponseBody>({
      method: "POST",
      url: TOKEN_ENDPOINT,
      form: true,
      failOnStatusCode: false,
      headers: authorization ? { Authorization: authorization } : {},
      body: {
        grant_type: "client_credentials",
        ...(options.form ?? {}),
      },
    });
  }

  function introspect(
    token: string,
  ): Cypress.Chainable<Cypress.Response<IntrospectionResponseBody>> {
    return cy.request<IntrospectionResponseBody>({
      method: "POST",
      url: INTROSPECTION_ENDPOINT,
      form: true,
      headers: {
        Authorization: basicHeader(
          confidentialClientId,
          confidentialClientSecret,
        ),
      },
      body: { token },
    });
  }

  function expectAccessTokenOnlyResponse(
    response: Cypress.Response<TokenResponseBody>,
  ): string {
    expect(response.status, "status").to.equal(200);
    expect(response.headers["cache-control"], "Cache-Control").to.contain(
      "no-store",
    );
    const body = response.body;
    expect(body.access_token, "access_token").to.be.a("string").and.not.be
      .empty;
    expect(body.token_type, "token_type").to.equal("Bearer");
    expect(body.expires_in, "expires_in").to.be.a("number").and.be.greaterThan(
      0,
    );
    // §4.4.3: no refresh token — the client re-authenticates instead —
    // and no id_token: no end user was authenticated.
    expect(body, "no refresh_token").to.not.have.property("refresh_token");
    expect(body, "no refresh_token_expires_in").to.not.have.property(
      "refresh_token_expires_in",
    );
    expect(body, "no id_token").to.not.have.property("id_token");
    return body.access_token as string;
  }

  it("advertises the grant in the discovery document", () => {
    cy.request<{ grant_types_supported?: string[] }>({
      method: "GET",
      url: DISCOVERY_ENDPOINT,
    }).then((response) => {
      expect(response.status, "status").to.equal(200);
      expect(
        response.body.grant_types_supported,
        "grant_types_supported",
      ).to.deep.equal([
        "authorization_code",
        "refresh_token",
        "client_credentials",
      ]);
    });
  });

  it("refuses a public (PKCE-only) client with unauthorized_client", () => {
    // §4.4: "MUST only be used by confidential clients". The public app
    // passes client authentication trivially (it has no secret), so the
    // refusal comes from the grant itself — 400, not a 401 challenge.
    requestClientCredentialsGrant({
      authorization: null,
      form: { client_id: publicClientId },
    }).then((response) => {
      expect(response.status, "status").to.equal(400);
      expect(response.body.error, "error").to.equal("unauthorized_client");
      expect(response.body.error_description, "error_description").to.contain(
        "confidential clients",
      );
      expect(response.headers["www-authenticate"], "WWW-Authenticate").to.be
        .undefined;
    });
  });

  it("refuses the auth server's own (hardcoded) app with unauthorized_client", () => {
    requestClientCredentialsGrant({
      authorization: null,
      form: { client_id: AUTH_APP_ID },
    }).then((response) => {
      expect(response.status, "status").to.equal(400);
      expect(response.body.error, "error").to.equal("unauthorized_client");
    });
  });

  it("rejects a confidential client that fails authentication with invalid_client", () => {
    requestClientCredentialsGrant({
      authorization: basicHeader(
        confidentialClientId,
        `${confidentialClientSecret}-wrong`,
      ),
    }).then((response) => {
      expect(response.status, "status").to.equal(401);
      expect(response.body.error, "error").to.equal("invalid_client");
      expect(response.headers["www-authenticate"], "WWW-Authenticate").to.equal(
        'Basic realm="oauth2/token", charset="UTF-8"',
      );
    });
    requestClientCredentialsGrant({
      authorization: null,
      form: { client_id: confidentialClientId },
    }).then((response) => {
      expect(response.status, "status (no credentials)").to.equal(401);
      expect(response.body.error, "error").to.equal("invalid_client");
    });
  });

  it("issues an access token only (no refresh token, no id_token) via client_secret_basic", () => {
    requestClientCredentialsGrant().then((response) => {
      const access_token = expectAccessTokenOnlyResponse(response);
      // Nothing was requested, so nothing was granted and no `scope` is
      // echoed (RFC 6749 §3.3 has no empty form).
      expect(response.body, "no scope").to.not.have.property("scope");

      // The token is opaque (a JWE) — look inside via introspection: it
      // is active, issued to this client, and its subject is the app's
      // service account, not any user.
      introspect(access_token).then((introspection) => {
        expect(introspection.status, "introspection status").to.equal(200);
        const claims = introspection.body;
        expect(claims.active, "active").to.equal(true);
        expect(claims.client_id, "client_id").to.equal(confidentialClientId);
        expect(claims.token_type, "token_type").to.equal("Bearer");
        expect(claims.sub, "sub").to.be.a("string").and.not.be.empty;
        expect(claims, "no scope").to.not.have.property("scope");
        expect(claims, "no username without the email scope").to.not.have.property(
          "username",
        );
      });
    });
  });

  it("issues an access token via client_secret_post too", () => {
    requestClientCredentialsGrant({
      authorization: null,
      form: {
        client_id: confidentialClientId,
        client_secret: confidentialClientSecret,
      },
    }).then((response) => {
      expectAccessTokenOnlyResponse(response);
    });
  });

  it("drops `openid` from the requested scope and echoes the granted set", () => {
    // There is no end user, so no OpenID authentication takes place: the
    // `openid` scope is dropped (like unknown scopes) and the response
    // carries the narrowed grant per RFC 6749 §5.1.
    requestClientCredentialsGrant({
      form: { scope: "openid email unknown-scope" },
    }).then((response) => {
      const access_token = expectAccessTokenOnlyResponse(response);
      expect(response.body.scope, "scope").to.equal("email");

      introspect(access_token).then((introspection) => {
        expect(introspection.body.active, "active").to.equal(true);
        expect(introspection.body.scope, "scope").to.equal("email");
        // With `email` granted, introspection reports the service
        // account's synthetic, undeliverable address as the username.
        expect(introspection.body.username, "username").to.equal(
          expectedServiceAccountEmail,
        );
      });

      // No OpenID authentication took place, so — exactly like a plain
      // OAuth 2.1 token — the M2M token is refused at /api/oidc/userinfo
      // (RFC 6750 §3.1 insufficient_scope): the identity endpoint is for
      // authenticated end users, not machine callers.
      cy.request<UserinfoResponseBody>({
        method: "GET",
        url: USERINFO_ENDPOINT,
        failOnStatusCode: false,
        headers: { Authorization: `Bearer ${access_token}` },
      }).then((userinfo) => {
        expect(userinfo.status, "userinfo status").to.equal(403);
        expect(userinfo.body.error, "error").to.equal("insufficient_scope");
      });
    });
  });

  it("rejects a malformed scope with invalid_scope", () => {
    requestClientCredentialsGrant({
      form: { scope: "email  double-space" },
    }).then((response) => {
      expect(response.status, "status").to.equal(400);
      expect(response.body.error, "error").to.equal("invalid_scope");
    });
  });

  it("mints tokens for the same service account on every grant", () => {
    requestClientCredentialsGrant().then((first) => {
      const first_token = expectAccessTokenOnlyResponse(first);
      requestClientCredentialsGrant().then((second) => {
        const second_token = expectAccessTokenOnlyResponse(second);
        expect(second_token, "distinct tokens").to.not.equal(first_token);
        introspect(first_token).then((a) => {
          introspect(second_token).then((b) => {
            expect(a.body.active && b.body.active, "both active").to.equal(
              true,
            );
            expect(b.body.sub, "stable subject").to.equal(a.body.sub);
          });
        });
      });
    });
  });

  it("mints a resource-server token via RFC 8707 `resource` that the example resource server accepts", () => {
    requestClientCredentialsGrant({
      form: { resource: exampleApiServerId, scope: "email" },
    }).then((response) => {
      const access_token = expectAccessTokenOnlyResponse(response);

      // Tokens for resource-API audiences are verified by the resource
      // server itself (introspection only covers the userinfo audience).
      // The example resource server's route guard verifies the JWE
      // against the auth server's JWKS and its own API server id.
      cy.request<{
        uid: string;
        email: string | null;
        admin: boolean;
        scheme: string;
        scope: string | null;
      }>({
        method: "GET",
        url: `${exampleAppOrigin}/api/whoami`,
        headers: { Authorization: `Bearer ${access_token}` },
      }).then((whoami) => {
        expect(whoami.status, "whoami status").to.equal(200);
        expect(whoami.body.scheme, "scheme").to.equal(
          "schemavaults-access-token",
        );
        expect(whoami.body.email, "email").to.equal(
          expectedServiceAccountEmail,
        );
        expect(whoami.body.admin, "admin").to.equal(false);
        expect(whoami.body.scope, "scope").to.equal("email");
        expect(whoami.body.uid, "uid").to.be.a("string").and.not.be.empty;

        // The scope claim gates the resource server's scoped operation.
        cy.request<{ email: string | null }>({
          method: "GET",
          url: `${exampleAppOrigin}/api/me/email`,
          headers: { Authorization: `Bearer ${access_token}` },
        }).then((me) => {
          expect(me.status, "me/email status").to.equal(200);
          expect(me.body.email, "email").to.equal(expectedServiceAccountEmail);
        });
      });
    });
  });

  it("refuses a `resource` the client is not connected to with invalid_target", () => {
    requestClientCredentialsGrant({
      form: { resource: "22222222-2222-2222-2222-222222222222" },
    }).then((response) => {
      expect(response.status, "status").to.equal(400);
      expect(response.body.error, "error").to.equal("invalid_target");
    });
  });

  it("refuses the auth server's own audience as a `resource` with invalid_target", () => {
    requestClientCredentialsGrant({
      form: { resource: Cypress.env("AUTH_SERVER_URL") },
    }).then((response) => {
      expect(response.status, "status").to.equal(400);
      expect(response.body.error, "error").to.equal("invalid_target");
    });
  });

  it("exposes the service account through the management API and the app page", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      expect(success, "superuser login").to.equal(true);

      cy.request<ServiceAccountResponseBody>({
        method: "GET",
        url: `/api/apps/${confidentialClientId}/service-account`,
      }).then((response) => {
        expect(response.status, "status").to.equal(200);
        expect(response.body.success, "success").to.equal(true);
        expect(response.body.has_client_secret, "has_client_secret").to.equal(
          true,
        );
        const service_account = response.body.service_account;
        expect(service_account, "service_account").to.not.be.null;
        expect(service_account!.email, "email").to.equal(
          expectedServiceAccountEmail,
        );
        expect(service_account!.disabled, "disabled").to.equal(false);
        const uid: string = service_account!.uid;

        // The public app has no client secret and never used the grant.
        cy.request<ServiceAccountResponseBody>({
          method: "GET",
          url: `/api/apps/${publicClientId}/service-account`,
        }).then((publicResponse) => {
          expect(publicResponse.status, "public app status").to.equal(200);
          expect(publicResponse.body.service_account, "service_account").to.be
            .null;
          expect(
            publicResponse.body.has_client_secret,
            "has_client_secret",
          ).to.equal(false);
        });

        // A freshly minted token's subject is that same uid: the
        // introspection `sub` is `<auth_server_app_id>|<uid>`.
        requestClientCredentialsGrant().then((grant) => {
          const access_token = expectAccessTokenOnlyResponse(grant);
          introspect(access_token).then((introspection) => {
            expect(introspection.body.sub, "sub").to.equal(
              `${AUTH_APP_ID}|${uid}`,
            );
          });
        });

        // The app detail page renders the service account card.
        cy.visit(`/apps/${confidentialClientId}`);
        cy.wait_for_page_hydration();
        cy.get('[data-testid="app-service-account-card"]', {
          timeout: 15000,
        }).within(() => {
          cy.get('[data-testid="service-account-uid"]').should(
            "have.text",
            uid,
          );
          cy.contains(expectedServiceAccountEmail).should("be.visible");
        });
      });
    });
  });

  it("cannot sign in interactively as the service account", () => {
    // A service account has no password; the login API must answer
    // exactly as it does for an unknown email (401, generic failure) so
    // the synthetic address reveals nothing.
    const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
    cy.wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
      PKCE_ProofKeyManager.createCodeChallenge(verifier),
      { log: false },
    ).then((challenge) => {
      cy.request<{ kind?: string; success?: boolean }>({
        method: "POST",
        url: "/api/auth/login",
        failOnStatusCode: false,
        body: {
          credentials: {
            email: expectedServiceAccountEmail,
            password: "NotARealPassword123!",
          },
          client_app_id: publicClientId,
          code_challenge: challenge.code_challenge,
          challenge_time: challenge.challenge_time,
          redirect_uri: `${exampleAppOrigin}/oauth2/callback`,
        },
      }).then((response) => {
        expect(response.status, "login status").to.equal(401);
        expect(response.body.kind, "kind").to.equal("failure");
        expect(response.body.success, "success").to.equal(false);
      });
    });
  });
});
