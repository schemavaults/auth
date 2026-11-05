// TokenExchangeGrant.cy.ts
//
// The RFC 8693 token exchange grant at POST /api/oidc/token
// (auth-server/src/app/api/oidc/token/token_exchange_grant.ts +
// lib/oidc/token-exchange/): a confidential client swaps an access token
// one of its users holds for an API server for a DELEGATED access token on
// which the client's service account acts for that user (the `act` claim),
// e.g. for an agent the client runs in a sandbox. And the client's
// revocation of such a token at POST /api/oidc/revoke when the agent's
// session ends.
//
// What the grant must do:
//   - mint an access token alone (no refresh token, no id_token) with
//     `issued_token_type`, for the subject token's user, client and
//     audience, with at most the subject token's scope;
//   - name the client's service account as the actor, as seen by the API
//     server's introspection and by a resource server's route guards (the
//     example resource server's /api/whoami reports the actor);
//   - only exchange a live access token for an API server, issued to the
//     requesting client, for a person, not yet delegated, and only while
//     the user's access behind it stands (their authorization of the app,
//     the session it was issued in, their account, the app's connection to
//     the API server);
//   - only for authenticated confidential clients, and only for API
//     servers that accept delegated tokens (`invalid_target` otherwise).
//
// The confidential app is seeded in cypress.config.ts's before:run hook
// (connected to the example resource server's API). This spec also creates
// a platform API server with its own JWKS access key, so it can introspect
// the delegated tokens as that API server, and turns on delegated tokens
// for the example resource server's API for the duration of the spec.

import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

interface TokenResponseBody {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  issued_token_type?: string;
  error?: string;
  error_description?: string;
}

interface IntrospectionActor {
  sub: string;
  uid: string;
  client_id?: string;
}

interface IntrospectionResponseBody {
  active: boolean;
  scope?: string;
  client_id?: string;
  uid?: string;
  aud?: string;
  service_account?: boolean;
  act?: IntrospectionActor;
}

interface WhoamiBody {
  uid: string;
  email: string | null;
  scope: string | null;
  actor: { sub: string; client_id: string | null } | null;
}

interface Credentials {
  email: string;
  password: string;
}

interface TestApiServer {
  api_server_id: string;
  private_key_pem: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("RFC 8693 token exchange (delegated tokens for agents)", () => {
  const TOKEN_ENDPOINT = "/api/oidc/token";
  const INTROSPECTION_ENDPOINT = "/api/oidc/introspect";
  const REVOCATION_ENDPOINT = "/api/oidc/revoke";
  const TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange";
  const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
  const JWT_BEARER_CLIENT_ASSERTION_TYPE =
    "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

  const confidentialClientId: string = Cypress.env(
    "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID",
  );
  const confidentialClientSecret: string = Cypress.env(
    "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET",
  );
  // The public example app, and the example resource server's API (same id).
  const PUBLIC_CLIENT_ID = "00000000-0000-0000-0000-000000000000";
  const EXAMPLE_API_SERVER_ID = "00000000-0000-0000-0000-000000000000";

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;
  // Registered for the public app; any path on the domain is accepted for
  // the confidential one.
  const REDIRECT_URI = `${exampleAppOrigin}/oauth2/callback`;

  const suffix: string = Math.random().toString(36).slice(2, 10);
  const ownApiServerId = `e2e-token-exchange-${suffix}`;
  let ownApiServer: TestApiServer;
  let user: Credentials;

  function basicHeader(client_id: string, client_secret: string): string {
    return `Basic ${btoa(`${encodeURIComponent(client_id)}:${encodeURIComponent(client_secret)}`)}`;
  }
  const CONFIDENTIAL_CLIENT_AUTH = (): string =>
    basicHeader(confidentialClientId, confidentialClientSecret);

  function postTokenRequest(
    body: Record<string, string>,
    authorization: string | null = CONFIDENTIAL_CLIENT_AUTH(),
  ): Cypress.Chainable<Cypress.Response<TokenResponseBody>> {
    return cy.request<TokenResponseBody>({
      method: "POST",
      url: TOKEN_ENDPOINT,
      form: true,
      failOnStatusCode: false,
      headers: authorization ? { Authorization: authorization } : {},
      body,
    });
  }

  /** A token exchange request; `subject_token_type` defaults to an access token. */
  function exchange(
    fields: Record<string, string>,
    authorization: string | null = CONFIDENTIAL_CLIENT_AUTH(),
  ): Cypress.Chainable<Cypress.Response<TokenResponseBody>> {
    return postTokenRequest(
      { grant_type: TOKEN_EXCHANGE, subject_token_type: ACCESS_TOKEN_TYPE, ...fields },
      authorization,
    );
  }

  function expectTokenError(
    response: Cypress.Response<TokenResponseBody>,
    status: number,
    error: string,
  ): void {
    expect(response.status, `status (${JSON.stringify(response.body)})`).to.equal(status);
    expect(response.body.error, "error").to.equal(error);
    expect(response.body.access_token, "no token").to.be.undefined;
  }

  function loginAsSuperuser(): void {
    cy.is_authenticated().then((authenticated: boolean) => {
      if (authenticated) {
        cy.logout();
      }
    });
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  }

  function setDelegatedTokenPolicy(api_server_id: string, accept: boolean): void {
    cy.request({
      method: "PUT",
      url: `/api/apis/${api_server_id}/delegated-token-policy`,
      body: { accept_delegated_tokens: accept },
    }).its("status").should("equal", 200);
  }

  /** The confidential app's service account uid (as the superuser). */
  function serviceAccountUid(): Cypress.Chainable<string> {
    return cy
      .request<{ service_account?: { uid: string } | null }>({
        method: "GET",
        url: `/api/apps/${confidentialClientId}/service-account`,
      })
      .then((response) => {
        const uid = response.body.service_account?.uid;
        expect(uid, "service account uid").to.be.a("string").and.not.be.empty;
        return uid as string;
      });
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
      .then((challenge) => ({ code_verifier: verifier.code_verifier, challenge }));
  }

  /**
   * Signs `as` (default: the spec's user) in to `client_id` through the
   * login API and redeems the code for a token response whose access token
   * is minted for `resource`.
   */
  function signIn(
    client_id: string,
    resource: string,
    as: Credentials = user,
  ): Cypress.Chainable<TokenResponseBody> {
    return createPkcePair().then(({ code_verifier, challenge }) =>
      cy
        .request<{ kind?: string; authorization_code?: string }>({
          method: "POST",
          url: "/api/auth/login",
          body: {
            credentials: { email: as.email, password: as.password },
            client_app_id: client_id,
            code_challenge: challenge.code_challenge,
            challenge_time: challenge.challenge_time,
            redirect_uri: REDIRECT_URI,
            scope: "openid email",
            resource,
          },
        })
        .then((login) => {
          expect(login.body.kind, "login kind").to.equal("authenticated");
          return postTokenRequest(
            {
              grant_type: "authorization_code",
              code: login.body.authorization_code as string,
              code_verifier,
              redirect_uri: REDIRECT_URI,
              resource,
              ...(client_id === PUBLIC_CLIENT_ID ? { client_id } : {}),
            },
            client_id === PUBLIC_CLIENT_ID ? null : CONFIDENTIAL_CLIENT_AUTH(),
          );
        })
        .then((response) => {
          expect(response.status, `code grant (${JSON.stringify(response.body)})`).to.equal(200);
          return response.body;
        }),
    );
  }

  function introspectAsOwnApiServer(
    token: string,
  ): Cypress.Chainable<IntrospectionResponseBody> {
    return cy
      .task("createJwksAccessProofToken", {
        api_server_id: ownApiServer.api_server_id,
        private_key_pem: ownApiServer.private_key_pem,
      })
      .then((client_assertion) =>
        cy.request<IntrospectionResponseBody>({
          method: "POST",
          url: INTROSPECTION_ENDPOINT,
          form: true,
          body: {
            token,
            client_id: ownApiServer.api_server_id,
            client_assertion_type: JWT_BEARER_CLIENT_ASSERTION_TYPE,
            client_assertion: String(client_assertion),
          },
        }),
      )
      .then((response) => {
        expect(response.status, "introspection status").to.equal(200);
        return response.body;
      });
  }

  function whoami(access_token: string): Cypress.Chainable<WhoamiBody> {
    return cy
      .request<WhoamiBody>({
        method: "GET",
        url: `${exampleAppOrigin}/api/whoami`,
        headers: { Authorization: `Bearer ${access_token}` },
      })
      .then((response) => {
        expect(response.status, "whoami status").to.equal(200);
        return response.body;
      });
  }

  /**
   * A new user with a verified address who authorized both example apps
   * (signed out again afterwards).
   */
  function createUserAuthorizedForApps(): Cypress.Chainable<Credentials> {
    return cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then((success) => {
        expect(success, "create_and_login_as_regular_user_via_request").to.be.true;
      });
      cy.verify_email_via_request(credentials.email).then((verified: boolean) => {
        expect(verified, "email verified").to.be.true;
      });
      for (const client_id of [confidentialClientId, PUBLIC_CLIENT_ID]) {
        cy.request({
          method: "POST",
          url: `/api/apps/${client_id}/authorize`,
          body: { scope: "openid email" },
        }).its("status").should("equal", 200);
      }
      cy.logout();
      return cy.wrap<Credentials>({ email: credentials.email, password: credentials.password });
    });
  }

  before(() => {
    cy.reset_rate_limit();
    loginAsSuperuser();
    // A platform API server of this spec's own, with a JWKS access key (to
    // introspect as it), the confidential app connected to it, and
    // delegated tokens on.
    cy.request({
      method: "POST",
      url: "/api/apis",
      body: {
        api_server_id: ownApiServerId,
        api_server_name: `Token exchange ${suffix}`,
        api_server_description: "TokenExchangeGrant.cy.ts",
        created_at: Date.now(),
        public: false,
        hardcoded: false,
        owner_type: "platform",
      },
    }).its("status").should("equal", 200);
    cy.generate_jwks_access_key(ownApiServerId).then(({ success, private_key }) => {
      expect(success, "JWKS access key created").to.be.true;
      ownApiServer = { api_server_id: ownApiServerId, private_key_pem: private_key as string };
    });
    cy.request({
      method: "POST",
      url: `/api/apis/${ownApiServerId}/connect_app/${confidentialClientId}`,
    }).its("status").should("equal", 200);
    setDelegatedTokenPolicy(ownApiServerId, true);
    setDelegatedTokenPolicy(EXAMPLE_API_SERVER_ID, true);
    cy.logout();

    createUserAuthorizedForApps().then((credentials) => {
      user = credentials;
    });
  });

  after(() => {
    // Leave the seeded example API server as other specs expect it.
    loginAsSuperuser();
    setDelegatedTokenPolicy(EXAMPLE_API_SERVER_ID, false);
    cy.logout();
  });

  beforeEach(() => {
    cy.reset_rate_limit();
  });

  it("advertises the grant in the discovery document", () => {
    cy.request<{ grant_types_supported?: string[] }>({
      method: "GET",
      url: "/.well-known/openid-configuration",
    }).then((response) => {
      expect(response.status, "status").to.equal(200);
      expect(response.body.grant_types_supported, "grant_types_supported").to.include(
        TOKEN_EXCHANGE,
      );
    });
  });

  it("mints a delegated access token on which the app's service account acts for the user", () => {
    signIn(confidentialClientId, ownApiServerId).then((subject) => {
      exchange({ subject_token: subject.access_token as string, scope: "email" }).then((response) => {
        expect(response.status, `status (${JSON.stringify(response.body)})`).to.equal(200);
        expect(response.body.issued_token_type, "issued_token_type").to.equal(ACCESS_TOKEN_TYPE);
        expect(response.body.token_type, "token_type").to.equal("Bearer");
        expect(response.body.expires_in, "expires_in").to.be.a("number");
        expect(response.body.scope, "scope").to.equal("email");
        // The access token comes alone: a refresh token cannot carry the actor.
        expect(response.body.refresh_token, "no refresh token").to.be.undefined;
        expect(response.body.id_token, "no id_token").to.be.undefined;

        introspectAsOwnApiServer(subject.access_token as string).then((own) => {
          expect(own.active, "subject token active").to.be.true;
          expect(own.act, "the user's own token has no actor").to.be.undefined;
          introspectAsOwnApiServer(response.body.access_token as string).then((delegated) => {
            expect(delegated.active, "active").to.be.true;
            expect(delegated.uid, "the subject is still the user").to.equal(own.uid);
            expect(delegated.client_id, "client_id").to.equal(confidentialClientId);
            expect(delegated.aud, "same audience").to.equal(ownApiServerId);
            expect(delegated.scope, "scope").to.equal("email");
            expect(delegated.service_account, "the subject is a person").to.be.undefined;
            expect(delegated.act?.client_id, "actor's client").to.equal(confidentialClientId);
            loginAsSuperuser();
            serviceAccountUid().then((uid) => {
              expect(delegated.act?.uid, "the actor is the app's service account").to.equal(uid);
            });
            cy.logout();
          });
        });
      });
    });
  });

  it("is accepted by a resource server, which sees the actor", () => {
    signIn(confidentialClientId, EXAMPLE_API_SERVER_ID).then((subject) => {
      whoami(subject.access_token as string).then((own) => {
        expect(own.actor, "the user's own token").to.be.null;
        exchange({ subject_token: subject.access_token as string }).then((response) => {
          expect(response.status, `status (${JSON.stringify(response.body)})`).to.equal(200);
          // Without `scope`, the subject token's scope.
          expect(response.body.scope, "scope").to.equal(subject.scope);
          whoami(response.body.access_token as string).then((delegated) => {
            expect(delegated.uid, "the user").to.equal(own.uid);
            expect(delegated.email, "the user's email").to.equal(user.email);
            expect(delegated.actor?.client_id, "actor's client").to.equal(confidentialClientId);
            expect(delegated.actor?.sub, "actor").to.be.a("string").and.not.be.empty;
          });
        });
      });
    });
  });

  it("narrows the subject token's scope and never widens it", () => {
    signIn(confidentialClientId, ownApiServerId).then((subject) => {
      const subject_token = subject.access_token as string;
      exchange({ subject_token, scope: "openid" }).its("body.scope").should("equal", "openid");
      exchange({ subject_token, scope: "openid email profile" }).then((response) => {
        expectTokenError(response, 400, "invalid_scope");
      });
    });
  });

  it("mints only for the subject token's own audience", () => {
    signIn(confidentialClientId, ownApiServerId).then((subject) => {
      const subject_token = subject.access_token as string;
      exchange({ subject_token, resource: ownApiServerId }).its("status").should("equal", 200);
      exchange({ subject_token, resource: EXAMPLE_API_SERVER_ID }).then((response) => {
        expectTokenError(response, 400, "invalid_target");
      });
    });
  });

  it("exchanges only a live access token of one of the client's users", () => {
    signIn(confidentialClientId, ownApiServerId).then((subject) => {
      exchange({ subject_token: subject.access_token as string }).then((delegated) => {
        // A delegated token cannot be delegated again (or renewed this way).
        exchange({ subject_token: delegated.body.access_token as string }).then((response) => {
          expectTokenError(response, 400, "invalid_request");
        });
      });
      // A refresh token is not an access token for an API server.
      exchange({ subject_token: subject.refresh_token as string }).then((response) => {
        expectTokenError(response, 400, "invalid_request");
      });
    });
    exchange({ subject_token: "not-a-token" }).then((response) => {
      expectTokenError(response, 400, "invalid_request");
    });
    // A service account has no user to act for.
    postTokenRequest({ grant_type: "client_credentials", resource: ownApiServerId }).then((m2m) => {
      expect(m2m.status, "client_credentials status").to.equal(200);
      exchange({ subject_token: m2m.body.access_token as string }).then((response) => {
        expectTokenError(response, 400, "invalid_request");
      });
    });
    // A token issued to another client (the public example app).
    signIn(PUBLIC_CLIENT_ID, EXAMPLE_API_SERVER_ID).then((other) => {
      exchange({ subject_token: other.access_token as string }).then((response) => {
        expectTokenError(response, 400, "invalid_request");
        expect(response.body.error_description).to.contain("not issued to this client");
      });
    });
  });

  it("validates the RFC 8693 request parameters", () => {
    signIn(confidentialClientId, ownApiServerId).then((subject) => {
      const subject_token = subject.access_token as string;
      exchange({}).then((response) => expectTokenError(response, 400, "invalid_request"));
      postTokenRequest({ grant_type: TOKEN_EXCHANGE, subject_token }).then((response) =>
        expectTokenError(response, 400, "invalid_request"),
      );
      exchange({
        subject_token,
        subject_token_type: "urn:ietf:params:oauth:token-type:refresh_token",
      }).then((response) => expectTokenError(response, 400, "invalid_request"));
      exchange({
        subject_token,
        requested_token_type: "urn:ietf:params:oauth:token-type:refresh_token",
      }).then((response) => expectTokenError(response, 400, "invalid_request"));
      exchange({ subject_token, actor_token: subject_token, actor_token_type: ACCESS_TOKEN_TYPE }).then(
        (response) => expectTokenError(response, 400, "invalid_request"),
      );
      exchange({ subject_token, audience: ownApiServerId }).then((response) =>
        expectTokenError(response, 400, "invalid_target"),
      );
    });
  });

  it("refuses the RFC 8693 parameters on every other grant", () => {
    signIn(confidentialClientId, ownApiServerId).then((subject) => {
      const subject_token = subject.access_token as string;
      const refusedWith = (param: string) => (response: Cypress.Response<TokenResponseBody>) => {
        expectTokenError(response, 400, "invalid_request");
        expect(response.body.error_description, "names the parameter").to.contain(`'${param}'`);
      };
      // A refresh grant carrying a subject token is refused, not run as a
      // plain refresh (and the refresh token is not rotated).
      postTokenRequest({
        grant_type: "refresh_token",
        refresh_token: subject.refresh_token as string,
        subject_token,
        subject_token_type: ACCESS_TOKEN_TYPE,
      }).then(refusedWith("subject_token"));
      postTokenRequest({
        grant_type: "client_credentials",
        resource: ownApiServerId,
        requested_token_type: ACCESS_TOKEN_TYPE,
      }).then(refusedWith("requested_token_type"));
      postTokenRequest({
        grant_type: "authorization_code",
        code: "unused",
        code_verifier: "unused",
        redirect_uri: REDIRECT_URI,
        actor_token: subject_token,
        actor_token_type: ACCESS_TOKEN_TYPE,
      }).then(refusedWith("actor_token"));
      // The refresh token still works: the refused request did not use it.
      postTokenRequest({
        grant_type: "refresh_token",
        refresh_token: subject.refresh_token as string,
      }).its("status").should("equal", 200);
    });
  });

  it("refuses the other grants' parameters on a token exchange", () => {
    signIn(confidentialClientId, ownApiServerId).then((subject) => {
      const subject_token = subject.access_token as string;
      const misplaced: Record<string, string> = {
        code: "unused",
        code_verifier: "unused",
        redirect_uri: REDIRECT_URI,
        refresh_token: subject.refresh_token as string,
        refresh_token_delivery: "http_only_cookie",
      };
      for (const [name, value] of Object.entries(misplaced)) {
        exchange({ subject_token, [name]: value }).then((response) => {
          expectTokenError(response, 400, "invalid_request");
          expect(response.body.error_description, "names the parameter").to.contain(`'${name}'`);
        });
      }
      // The shared parameters stay allowed.
      exchange({ subject_token, scope: "openid", resource: ownApiServerId }).its("status").should("equal", 200);
    });
  });

  it("is only available to authenticated confidential clients", () => {
    signIn(confidentialClientId, ownApiServerId).then((subject) => {
      const subject_token = subject.access_token as string;
      exchange({ subject_token, client_id: PUBLIC_CLIENT_ID }, null).then((response) =>
        expectTokenError(response, 400, "unauthorized_client"),
      );
      exchange({ subject_token }, basicHeader(confidentialClientId, "wrong-secret")).then((response) =>
        expectTokenError(response, 401, "invalid_client"),
      );
    });
  });

  it("is refused for an API server that does not accept delegated tokens", () => {
    signIn(confidentialClientId, ownApiServerId).then((subject) => {
      loginAsSuperuser();
      setDelegatedTokenPolicy(ownApiServerId, false);
      cy.logout();
      exchange({ subject_token: subject.access_token as string }).then((response) =>
        expectTokenError(response, 400, "invalid_target"),
      );
      loginAsSuperuser();
      setDelegatedTokenPolicy(ownApiServerId, true);
      cy.logout();
    });
  });

  it("lets the client revoke a delegated token when the agent's session ends", () => {
    signIn(confidentialClientId, ownApiServerId).then((subject) => {
      exchange({ subject_token: subject.access_token as string }).then((response) => {
        const delegated = response.body.access_token as string;
        introspectAsOwnApiServer(delegated).its("active").should("equal", true);
        // Not by another client...
        cy.request<TokenResponseBody>({
          method: "POST",
          url: REVOCATION_ENDPOINT,
          form: true,
          failOnStatusCode: false,
          body: { token: delegated, client_id: PUBLIC_CLIENT_ID },
        }).then((refused) => {
          expect(refused.status, "status").to.equal(400);
          expect(refused.body.error, "error").to.equal("invalid_grant");
        });
        // ...but by the client it was issued to.
        cy.request({
          method: "POST",
          url: REVOCATION_ENDPOINT,
          form: true,
          headers: { Authorization: CONFIDENTIAL_CLIENT_AUTH() },
          body: { token: delegated },
        }).its("status").should("equal", 200);
        introspectAsOwnApiServer(delegated).should("deep.equal", { active: false });
        // The user's own token is untouched.
        introspectAsOwnApiServer(subject.access_token as string).its("active").should("equal", true);
      });
    });
  });

  describe("refuses a subject token once the user's access behind it is withdrawn", () => {
    /**
     * Signs a new user in to the confidential app, checks their access token
     * is exchangeable now, then hands it over: each case withdraws access
     * one way and expects the same token to be refused. A user of their own
     * per case, so nothing withdrawn here touches the other tests.
     */
    function withExchangeableSubject(
      run: (subject: TokenResponseBody, credentials: Credentials) => void,
    ): void {
      createUserAuthorizedForApps().then((credentials) => {
        signIn(confidentialClientId, ownApiServerId, credentials).then((subject) => {
          exchange({ subject_token: subject.access_token as string })
            .its("status")
            .should("equal", 200);
          run(subject, credentials);
        });
      });
    }

    function expectRefused(subject: TokenResponseBody): void {
      exchange({ subject_token: subject.access_token as string }).then((response) =>
        expectTokenError(response, 400, "invalid_request"),
      );
    }

    it("when the user has de-authorized the app", () => {
      withExchangeableSubject((subject, credentials) => {
        // signIn()'s login API call also left the user an auth server
        // session; start a fresh one explicitly to act as them.
        cy.is_authenticated().then((authenticated: boolean) => {
          if (authenticated) {
            cy.logout();
          }
        });
        cy.login_via_request(credentials.email, credentials.password).then((ok: boolean) => {
          expect(ok, "signed in as the user").to.be.true;
        });
        // Signing out and in again left the subject token exchangeable, so
        // the refusal below is the de-authorization's doing.
        exchange({ subject_token: subject.access_token as string })
          .its("status")
          .should("equal", 200);
        cy.request({
          method: "DELETE",
          url: `/api/apps/${confidentialClientId}/authorize`,
        }).its("status").should("equal", 200);
        cy.logout();
        expectRefused(subject);
      });
    });

    it("when the session it was issued in has ended", () => {
      withExchangeableSubject((subject) => {
        // Revoking the session's refresh token revokes the access tokens
        // issued alongside it, as logout does.
        cy.request({
          method: "POST",
          url: REVOCATION_ENDPOINT,
          form: true,
          headers: { Authorization: CONFIDENTIAL_CLIENT_AUTH() },
          body: { token: subject.refresh_token as string },
        }).its("status").should("equal", 200);
        expectRefused(subject);
      });
    });

    it("when the user's account is disabled", () => {
      withExchangeableSubject((subject) => {
        introspectAsOwnApiServer(subject.access_token as string).then(({ uid }) => {
          expect(uid, "subject uid").to.be.a("string").and.not.be.empty;
          loginAsSuperuser();
          cy.request({
            method: "POST",
            url: `/api/admin/users/${uid as string}/disable`,
          }).its("status").should("equal", 200);
          cy.logout();
          expectRefused(subject);
        });
      });
    });

    it("when the app is disconnected from the API server", () => {
      withExchangeableSubject((subject) => {
        loginAsSuperuser();
        cy.request({
          method: "DELETE",
          url: `/api/apis/${ownApiServerId}/connect_app/${confidentialClientId}`,
        }).its("status").should("equal", 200);
        cy.logout();
        expectRefused(subject);
        // Reconnect the app for whatever runs next.
        loginAsSuperuser();
        cy.request({
          method: "POST",
          url: `/api/apis/${ownApiServerId}/connect_app/${confidentialClientId}`,
        }).its("status").should("equal", 200);
        cy.logout();
      });
    });
  });
});
