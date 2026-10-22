// ApiScopes.cy.ts
//
// API scopes: OAuth 2.0 scope values an API server defines for itself
// (`/api/apis/{api_server_id}/scopes`), granted to authorization requests
// that name the API server as their RFC 8707 `resource`.
//
// Covers:
//   - the management API (define / list / edit / delete, value validation,
//     who may manage);
//   - GET /api/oidc/authorize: a single usable `resource` forwards the
//     requested API scopes it defines to the login UI; without one (or with
//     an unusable one) the request behaves exactly as before — only OIDC
//     scopes, no error;
//   - the token endpoint: API scopes go on access tokens minted for their
//     API server only, stay on the refresh token across audiences, and can
//     be narrowed but not widened on refresh; client_credentials never
//     grants them;
//   - the example resource server enforcing an API scope with
//     `requiredScopes` (GET /api/me/notes needs `example:notes.read`).
//
// The example app and API server (the same id) are seeded in
// cypress.config.ts's before:run hook; the app is connected to its API.

import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

interface OidcTokenResponseBody {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface ApiServerScopeBody {
  api_server_scope_id: string;
  api_server_id: string;
  scope: string;
  description: string;
  created_at: number;
  created_by: string | null;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("API scopes (per-API-server OAuth 2.0 scopes)", () => {
  const AUTHORIZE_ENDPOINT = "/api/oidc/authorize";
  const TOKEN_ENDPOINT = "/api/oidc/token";

  const CLIENT_ID = "00000000-0000-0000-0000-000000000000";
  const API_SERVER_ID = "00000000-0000-0000-0000-000000000000";
  const SCOPES_URL = `/api/apis/${API_SERVER_ID}/scopes`;

  // `example:notes.read` gates GET /api/me/notes on the example resource
  // server; `example:notes.write` is defined but never granted below.
  const NOTES_READ = "example:notes.read";
  const NOTES_WRITE = "example:notes.write";
  const DEFINED_SCOPES: Record<string, string> = {
    [NOTES_READ]: "Read your notes",
    [NOTES_WRITE]: "Create and edit your notes",
  };

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;
  const REDIRECT_URI = `${exampleAppOrigin}/oauth2/callback`;

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

  function listScopes(): Cypress.Chainable<ApiServerScopeBody[]> {
    return cy
      .request<{ success: boolean; list: ApiServerScopeBody[] }>({
        method: "GET",
        url: SCOPES_URL,
      })
      .then((response) => {
        expect(response.status, "list scopes status").to.equal(200);
        return response.body.list;
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
      .then((challenge) => ({
        code_verifier: verifier.code_verifier,
        challenge,
      }));
  }

  /** GET /api/oidc/authorize without following the redirect. */
  function probeAuthorizeEndpoint(
    scope: string,
    resources: readonly string[],
  ): Cypress.Chainable<URL> {
    return createPkcePair().then(({ challenge }) => {
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        code_challenge: challenge.code_challenge,
        code_challenge_method: "S256",
        state: `e2e-state-${Date.now()}`,
        scope,
      });
      for (const resource of resources) {
        params.append("resource", resource);
      }
      return cy
        .request({
          method: "GET",
          url: `${AUTHORIZE_ENDPOINT}?${params.toString()}`,
          followRedirect: false,
          failOnStatusCode: false,
        })
        .then((response) => {
          expect(response.status, "authorize status").to.equal(302);
          const bridge = new URL(response.headers["location"] as string);
          expect(bridge.pathname, "bridge path").to.equal("/auth/login");
          return bridge;
        });
    });
  }

  /**
   * Creates a fresh user with a verified e-mail address who has authorized
   * the example app (signed in, so the login API can mint codes for them).
   */
  function createUserAuthorizedForExampleApp(): Cypress.Chainable<{
    email: string;
    password: string;
  }> {
    cy.is_authenticated().then((authenticated: boolean) => {
      if (authenticated) {
        cy.logout();
      }
    });
    return cy.generate_random_test_user_credentials().then((credentials) =>
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success, "create_and_login_as_regular_user should succeed").to
          .be.true;
        cy.verify_email_via_request(credentials.email).then(
          (verified: boolean) => {
            expect(verified, "email verified").to.be.true;
          },
        );
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

  /** Mints an authorization code through the login API. */
  function mintAuthorizationCode(opts: {
    email: string;
    password: string;
    scope: string;
    resource?: string;
  }): Cypress.Chainable<{ code: string; code_verifier: string }> {
    return createPkcePair().then(({ code_verifier, challenge }) =>
      cy
        .request({
          method: "POST",
          url: "/api/auth/login",
          body: {
            credentials: { email: opts.email, password: opts.password },
            client_app_id: CLIENT_ID,
            code_challenge: challenge.code_challenge,
            challenge_time: challenge.challenge_time,
            redirect_uri: REDIRECT_URI,
            scope: opts.scope,
            ...(opts.resource !== undefined ? { resource: opts.resource } : {}),
          },
        })
        .then((response) => {
          const body = response.body as {
            kind?: string;
            authorization_code?: string;
          };
          expect(body.kind, "login kind").to.equal("authenticated");
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

  function redeem(
    minted: { code: string; code_verifier: string },
    resource?: string,
  ): Cypress.Chainable<Cypress.Response<OidcTokenResponseBody>> {
    return postTokenRequest({
      grant_type: "authorization_code",
      code: minted.code,
      code_verifier: minted.code_verifier,
      redirect_uri: REDIRECT_URI,
      ...(resource !== undefined ? { resource } : {}),
    });
  }

  function refresh(
    refresh_token: string,
    extra: Record<string, string> = {},
  ): Cypress.Chainable<Cypress.Response<OidcTokenResponseBody>> {
    return postTokenRequest({
      grant_type: "refresh_token",
      refresh_token,
      ...extra,
    });
  }

  before(() => {
    cy.reset_rate_limit();
    // Define the example API server's scopes (idempotent across runs).
    loginAsSuperuser();
    listScopes().then((existing) => {
      for (const [scope, description] of Object.entries(DEFINED_SCOPES)) {
        if (existing.some((row) => row.scope === scope)) continue;
        cy.request({
          method: "POST",
          url: SCOPES_URL,
          body: { scope, description },
        }).then((response) => {
          expect(response.status, `define ${scope}`).to.equal(200);
        });
      }
    });
    cy.logout();
  });

  after(() => {
    // Leave the seeded API server as other specs expect it: no scopes.
    loginAsSuperuser();
    listScopes().then((existing) => {
      for (const row of existing) {
        cy.request({
          method: "DELETE",
          url: `${SCOPES_URL}/${row.api_server_scope_id}`,
        });
      }
    });
    cy.logout();
  });

  beforeEach(() => {
    cy.reset_rate_limit();
  });

  describe("management API", () => {
    it("lists the defined scopes with their descriptions", () => {
      loginAsSuperuser();
      listScopes().then((list) => {
        for (const [scope, description] of Object.entries(DEFINED_SCOPES)) {
          const row = list.find((r) => r.scope === scope);
          expect(row, scope).to.exist;
          expect(row?.description, `${scope} description`).to.equal(description);
          expect(row?.api_server_id, `${scope} api_server_id`).to.equal(
            API_SERVER_ID,
          );
        }
      });
      cy.logout();
    });

    it("refuses OIDC scope names, malformed values and duplicates", () => {
      loginAsSuperuser();
      for (const scope of ["openid", "email", "offline_access", "notes read", ""]) {
        cy.request({
          method: "POST",
          url: SCOPES_URL,
          body: { scope, description: "Nope" },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, `'${scope}' status`).to.equal(400);
        });
      }
      cy.request({
        method: "POST",
        url: SCOPES_URL,
        body: { scope: NOTES_READ, description: "Again" },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "duplicate status").to.equal(409);
      });
      cy.logout();
    });

    it("edits a description and deletes a scope", () => {
      loginAsSuperuser();
      cy.request<{ success: boolean; scope: ApiServerScopeBody }>({
        method: "POST",
        url: SCOPES_URL,
        body: { scope: "example:temporary", description: "Temporary" },
      }).then((created) => {
        expect(created.status, "create status").to.equal(200);
        const id = created.body.scope.api_server_scope_id;
        cy.request<{ success: boolean; scope: ApiServerScopeBody }>({
          method: "PATCH",
          url: `${SCOPES_URL}/${id}`,
          body: { description: "  Still temporary  " },
        }).then((updated) => {
          expect(updated.status, "update status").to.equal(200);
          expect(updated.body.scope.description, "trimmed").to.equal(
            "Still temporary",
          );
          expect(updated.body.scope.scope, "value unchanged").to.equal(
            "example:temporary",
          );
        });
        cy.request({ method: "DELETE", url: `${SCOPES_URL}/${id}` }).then(
          (deleted) => {
            expect(deleted.status, "delete status").to.equal(200);
          },
        );
        cy.request({
          method: "DELETE",
          url: `${SCOPES_URL}/${id}`,
          failOnStatusCode: false,
        }).then((again) => {
          expect(again.status, "second delete status").to.equal(404);
        });
      });
      cy.logout();
    });

    it("refuses scope changes from users who cannot manage the API server", () => {
      createUserAuthorizedForExampleApp().then(() => {
        cy.request({
          method: "POST",
          url: SCOPES_URL,
          body: { scope: "example:sneaky", description: "Sneaky" },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "create as regular user").to.equal(403);
        });
      });
      cy.logout();
    });
  });

  describe("GET /api/oidc/authorize", () => {
    it("forwards the requested API scopes and the resource to the login UI", () => {
      probeAuthorizeEndpoint(`openid ${NOTES_READ} unknown:scope`, [
        API_SERVER_ID,
      ]).then((bridge) => {
        expect(bridge.searchParams.get("scope"), "scope").to.equal(
          `openid ${NOTES_READ}`,
        );
        expect(bridge.searchParams.get("resource"), "resource").to.equal(
          API_SERVER_ID,
        );
      });
    });

    it("grants OIDC scopes only, as before, without a usable resource", () => {
      const unusable: readonly (readonly string[])[] = [
        [],
        ["https://unknown-resource.example.com/api"],
        [API_SERVER_ID, "https://unknown-resource.example.com/api"],
      ];
      for (const resources of unusable) {
        probeAuthorizeEndpoint(`openid ${NOTES_READ}`, resources).then(
          (bridge) => {
            expect(
              bridge.searchParams.get("scope"),
              `scope (${resources.join(", ")})`,
            ).to.equal("openid");
            expect(
              bridge.searchParams.has("resource"),
              `resource forwarded (${resources.join(", ")})`,
            ).to.be.false;
          },
        );
      }
    });

    it("does not forward a resource when no API scope was requested", () => {
      probeAuthorizeEndpoint("openid email", [API_SERVER_ID]).then((bridge) => {
        expect(bridge.searchParams.get("scope"), "scope").to.equal("openid email");
        expect(bridge.searchParams.has("resource"), "resource forwarded").to.be
          .false;
      });
    });
  });

  describe("POST /api/oidc/token", () => {
    it("puts API scopes on the access token for their API server, which enforces them", () => {
      createUserAuthorizedForExampleApp().then(({ email, password }) => {
        mintAuthorizationCode({
          email,
          password,
          scope: `openid email ${NOTES_READ}`,
          resource: API_SERVER_ID,
        }).then((minted) => {
          redeem(minted, API_SERVER_ID).then((response) => {
            expect(response.status, "code grant status").to.equal(200);
            expect(response.body.scope, "scope").to.equal(
              `openid email ${NOTES_READ}`,
            );
            expect(response.body.id_token, "id_token").to.be.a("string");
            const access_token = response.body.access_token as string;

            cy.request<{ scope: string | null }>({
              method: "GET",
              url: `${exampleAppOrigin}/api/whoami`,
              headers: { Authorization: `Bearer ${access_token}` },
            }).then((whoami) => {
              expect(whoami.body.scope, "token scope claim").to.equal(
                `openid email ${NOTES_READ}`,
              );
            });
            cy.request<{ notes: string[] }>({
              method: "GET",
              url: `${exampleAppOrigin}/api/me/notes`,
              headers: { Authorization: `Bearer ${access_token}` },
            }).then((notes) => {
              expect(notes.status, "me/notes status").to.equal(200);
              expect(notes.body.notes, "notes").to.deep.equal([]);
            });
          });
        });
      });
    });

    it("keeps API scopes off other audiences but on the rotated refresh token", () => {
      createUserAuthorizedForExampleApp().then(({ email, password }) => {
        mintAuthorizationCode({
          email,
          password,
          scope: `openid email ${NOTES_READ}`,
          resource: API_SERVER_ID,
        }).then((minted) => {
          // No `resource`: the userinfo-audience token, OIDC scopes only.
          redeem(minted).then((response) => {
            expect(response.status, "code grant status").to.equal(200);
            expect(response.body.scope, "userinfo token scope").to.equal(
              "openid email",
            );
            const first_refresh = response.body.refresh_token as string;

            refresh(first_refresh, { resource: API_SERVER_ID }).then(
              (forApi) => {
                expect(forApi.status, "refresh for API status").to.equal(200);
                expect(forApi.body.scope, "API token scope").to.equal(
                  `openid email ${NOTES_READ}`,
                );

                // Again without a resource, then back to the API: the
                // rotated refresh token still holds the API scope.
                refresh(forApi.body.refresh_token as string).then((plain) => {
                  expect(plain.body.scope, "plain refresh scope").to.equal(
                    "openid email",
                  );
                  refresh(plain.body.refresh_token as string, {
                    resource: API_SERVER_ID,
                  }).then((again) => {
                    expect(again.body.scope, "API scope kept").to.equal(
                      `openid email ${NOTES_READ}`,
                    );
                  });
                });
              },
            );
          });
        });
      });
    });

    it("narrows API scopes on refresh but refuses to widen them", () => {
      createUserAuthorizedForExampleApp().then(({ email, password }) => {
        mintAuthorizationCode({
          email,
          password,
          scope: `openid ${NOTES_READ}`,
          resource: API_SERVER_ID,
        }).then((minted) => {
          redeem(minted, API_SERVER_ID).then((response) => {
            const refresh_token = response.body.refresh_token as string;
            refresh(refresh_token, {
              resource: API_SERVER_ID,
              scope: `${NOTES_READ} ${NOTES_WRITE}`,
            }).then((widened) => {
              expect(widened.status, "widen status").to.equal(400);
              expect(widened.body.error, "widen error").to.equal(
                "invalid_scope",
              );
            });
            refresh(refresh_token, {
              resource: API_SERVER_ID,
              scope: NOTES_READ,
            }).then((narrowed) => {
              expect(narrowed.status, "narrow status").to.equal(200);
              expect(narrowed.body.scope, "narrowed scope").to.equal(NOTES_READ);
              expect(narrowed.body.id_token, "no id_token on refresh").to.be
                .undefined;
            });
          });
        });
      });
    });

    it("grants no API scope to a code minted without a resource, and the API server refuses the token", () => {
      createUserAuthorizedForExampleApp().then(({ email, password }) => {
        mintAuthorizationCode({
          email,
          password,
          scope: `openid email ${NOTES_READ}`,
        }).then((minted) => {
          redeem(minted, API_SERVER_ID).then((response) => {
            expect(response.status, "code grant status").to.equal(200);
            expect(response.body.scope, "scope").to.equal("openid email");
            cy.request({
              method: "GET",
              url: `${exampleAppOrigin}/api/me/notes`,
              headers: { Authorization: `Bearer ${response.body.access_token}` },
              failOnStatusCode: false,
            }).then((notes) => {
              expect(notes.status, "me/notes status").to.equal(403);
              expect(
                (notes.body as { error?: string }).error,
                "me/notes error",
              ).to.equal("insufficient_scope");
            });
          });
        });
      });
    });

    it("never grants API scopes to the client_credentials grant", () => {
      const client_id: string = Cypress.env(
        "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID",
      );
      const client_secret: string = Cypress.env(
        "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET",
      );
      cy.request<OidcTokenResponseBody>({
        method: "POST",
        url: TOKEN_ENDPOINT,
        form: true,
        failOnStatusCode: false,
        headers: {
          Authorization: `Basic ${btoa(
            `${encodeURIComponent(client_id)}:${encodeURIComponent(client_secret)}`,
          )}`,
        },
        body: {
          grant_type: "client_credentials",
          resource: API_SERVER_ID,
          scope: `email ${NOTES_READ}`,
        },
      }).then((response) => {
        expect(response.status, "status").to.equal(200);
        expect(response.body.scope, "scope").to.equal("email");
      });
    });
  });
});
