// ApiScopeConsent.cy.ts
//
// What a user lets an app do with an API server's scopes, and what an API
// server's owner lets each connected app be granted:
//   - per-scope consent: codes carry only the API scopes the user consented
//     to; `GET /api/apps/{app_id}/check-authorization?scope=…&resource=…`
//     reports the granted and pending ones; consenting again adds scopes
//     (incremental authorization); requests without API scopes behave as
//     before (consent only for an app the user never authorized);
//   - per-app allowances (`/api/apis/{api_server_id}/connect_app/{client_app_id}/scopes`):
//     restricting what users can grant an app;
//   - `prompt=none` / `prompt=consent` at `GET /api/oidc/authorize`;
//   - third-party access: `GET /api/me/connected-apps`, withdrawing one
//     scope, removing an app's access;
//   - the consent screen's per-scope checkboxes, the third-party access
//     page, and the scope allowances dialog.
//
// The example app and API server (the same id) are seeded in
// cypress.config.ts's before:run hook; the app is connected to its API.
// The client_credentials allowance is covered by ApiScopes.cy.ts.

import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

interface OidcTokenResponseBody {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
}

interface ApiServerScopeBody {
  api_server_scope_id: string;
  scope: string;
}

interface ConsentScopeBody {
  api_server_scope_id: string;
  scope: string;
  description: string;
}

interface AppConsentStatusBody {
  success: boolean;
  authorized: boolean;
  consent_required: boolean;
  requested_oidc_scopes: string[];
  api_server: { api_server_id: string; api_server_name: string } | null;
  granted_api_scopes: ConsentScopeBody[];
  pending_api_scopes: ConsentScopeBody[];
}

interface ConnectedAppBody {
  app_id: string;
  app_name: string;
  authorized_at: number;
  last_used_at: number | null;
  api_scopes: (ConsentScopeBody & {
    api_server_id: string;
    api_server_name: string;
    granted_at: number;
  })[];
}

interface Credentials {
  email: string;
  password: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("API scope consent, allowances and third-party access", () => {
  const AUTHORIZE_ENDPOINT = "/api/oidc/authorize";
  const TOKEN_ENDPOINT = "/api/oidc/token";

  const CLIENT_ID = "00000000-0000-0000-0000-000000000000";
  const API_SERVER_ID = "00000000-0000-0000-0000-000000000000";
  const SCOPES_URL = `/api/apis/${API_SERVER_ID}/scopes`;
  const POLICY_URL = `/api/apis/${API_SERVER_ID}/connect_app/${CLIENT_ID}/scopes`;

  const NOTES_READ = "example:notes.read";
  const NOTES_WRITE = "example:notes.write";
  const DEFINED_SCOPES: Record<string, string> = {
    [NOTES_READ]: "Read your notes",
    [NOTES_WRITE]: "Create and edit your notes",
  };
  const BOTH = `${NOTES_READ} ${NOTES_WRITE}`;

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;
  const REDIRECT_URI = `${exampleAppOrigin}/oauth2/callback`;

  function logoutIfAuthenticated(): void {
    cy.is_authenticated().then((authenticated: boolean) => {
      if (authenticated) {
        cy.logout();
      }
    });
  }

  function loginAsSuperuser(): void {
    logoutIfAuthenticated();
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  }

  function setUserScopeRestriction(user_scopes: readonly string[] | null): void {
    cy.request({
      method: "PUT",
      url: POLICY_URL,
      body: {
        restrict_user_scopes: user_scopes !== null,
        user_scopes: user_scopes ?? [],
        service_account_scopes: [],
      },
    }).then((response) => {
      expect(response.status, "set allowances status").to.equal(200);
    });
  }

  /** A fresh, signed-in user (verified e-mail address unless told otherwise). */
  function createSignedInUser(
    opts: { verified?: boolean } = {},
  ): Cypress.Chainable<Credentials> {
    logoutIfAuthenticated();
    return cy.generate_random_test_user_credentials().then((credentials) =>
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success, "create_and_login_as_regular_user should succeed").to
          .be.true;
        if (opts.verified !== false) {
          cy.verify_email_via_request(credentials.email).then(
            (verified: boolean) => {
              expect(verified, "email verified").to.be.true;
            },
          );
        }
        return cy.wrap<Credentials>(credentials, { log: false });
      }),
    );
  }

  /** POST /api/apps/{CLIENT_ID}/authorize as the signed-in user. */
  function authorizeApp(body: {
    scope?: string;
    resource?: string;
    approved_api_scopes?: string[];
  }): void {
    cy.request({
      method: "POST",
      url: `/api/apps/${CLIENT_ID}/authorize`,
      body,
    }).then((response) => {
      expect(response.status, "authorize app status").to.equal(200);
    });
  }

  function consentStatus(
    scope?: string,
    resource?: string,
  ): Cypress.Chainable<AppConsentStatusBody> {
    const params = new URLSearchParams();
    if (scope) params.set("scope", scope);
    if (resource) params.set("resource", resource);
    const query = params.toString();
    return cy
      .request<AppConsentStatusBody>({
        method: "GET",
        url: `/api/apps/${CLIENT_ID}/check-authorization${query ? `?${query}` : ""}`,
      })
      .then((response) => {
        expect(response.status, "check-authorization status").to.equal(200);
        return response.body;
      });
  }

  function scopeValues(scopes: readonly { scope: string }[]): string[] {
    return scopes.map((s) => s.scope).sort();
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

  /** Mints an authorization code through the login API. */
  function mintAuthorizationCode(
    credentials: Credentials,
    scope: string,
  ): Cypress.Chainable<{ code: string; code_verifier: string }> {
    return createPkcePair().then(({ code_verifier, challenge }) =>
      cy
        .request({
          method: "POST",
          url: "/api/auth/login",
          body: {
            credentials,
            client_app_id: CLIENT_ID,
            code_challenge: challenge.code_challenge,
            challenge_time: challenge.challenge_time,
            redirect_uri: REDIRECT_URI,
            scope,
            resource: API_SERVER_ID,
          },
        })
        .then((response) => {
          const body = response.body as {
            kind?: string;
            authorization_code?: string;
          };
          expect(body.kind, "login kind").to.equal("authenticated");
          return { code: body.authorization_code as string, code_verifier };
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

  /** Redeems a code for an access token for the example API server. */
  function redeemForApi(minted: {
    code: string;
    code_verifier: string;
  }): Cypress.Chainable<OidcTokenResponseBody> {
    return postTokenRequest({
      grant_type: "authorization_code",
      code: minted.code,
      code_verifier: minted.code_verifier,
      redirect_uri: REDIRECT_URI,
      resource: API_SERVER_ID,
    }).then((response) => {
      expect(response.status, "code grant status").to.equal(200);
      return response.body;
    });
  }

  /** GET /api/oidc/authorize without following the redirect. */
  function authorizeRequest(opts: {
    scope: string;
    prompt?: string;
    state?: string;
  }): Cypress.Chainable<{ location: URL; code_verifier: string }> {
    return createPkcePair().then(({ code_verifier, challenge }) => {
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        code_challenge: challenge.code_challenge,
        code_challenge_method: "S256",
        state: opts.state ?? `e2e-state-${Date.now()}`,
        scope: opts.scope,
        resource: API_SERVER_ID,
      });
      if (opts.prompt !== undefined) params.set("prompt", opts.prompt);
      return cy
        .request({
          method: "GET",
          url: `${AUTHORIZE_ENDPOINT}?${params.toString()}`,
          followRedirect: false,
          failOnStatusCode: false,
        })
        .then((response) => {
          expect(response.status, "authorize status").to.equal(302);
          return {
            location: new URL(response.headers["location"] as string),
            code_verifier,
          };
        });
    });
  }

  function expectRedirectError(location: URL, error: string, state: string): void {
    expect(`${location.origin}${location.pathname}`, "redirected to client").to.equal(
      REDIRECT_URI,
    );
    expect(location.searchParams.get("error"), "error").to.equal(error);
    expect(location.searchParams.get("state"), "state").to.equal(state);
    expect(location.searchParams.has("code"), "no code").to.be.false;
  }

  function listConnectedApps(): Cypress.Chainable<ConnectedAppBody[]> {
    return cy
      .request<{ success: boolean; list: ConnectedAppBody[] }>({
        method: "GET",
        url: "/api/me/connected-apps",
      })
      .then((response) => {
        expect(response.status, "connected apps status").to.equal(200);
        return response.body.list;
      });
  }

  before(() => {
    cy.reset_rate_limit();
    // Define the example API server's scopes (idempotent across runs).
    loginAsSuperuser();
    cy.request<{ success: boolean; list: ApiServerScopeBody[] }>({
      method: "GET",
      url: SCOPES_URL,
    }).then((listed) => {
      for (const [scope, description] of Object.entries(DEFINED_SCOPES)) {
        if (listed.body.list.some((row) => row.scope === scope)) continue;
        cy.request({ method: "POST", url: SCOPES_URL, body: { scope, description } });
      }
    });
    setUserScopeRestriction(null);
    cy.logout();
  });

  after(() => {
    // Leave the seeded API server as other specs expect it: no scopes
    // (their grants and consents go with them) and no restriction.
    loginAsSuperuser();
    setUserScopeRestriction(null);
    cy.request<{ success: boolean; list: ApiServerScopeBody[] }>({
      method: "GET",
      url: SCOPES_URL,
    }).then((listed) => {
      for (const row of listed.body.list) {
        cy.request({ method: "DELETE", url: `${SCOPES_URL}/${row.api_server_scope_id}` });
      }
    });
    cy.logout();
  });

  beforeEach(() => {
    cy.reset_rate_limit();
  });

  describe("per-scope consent", () => {
    it("asks only for an unauthorized app when no API scope is requested (as before)", () => {
      createSignedInUser().then(() => {
        consentStatus().then((status) => {
          expect(status.authorized, "authorized").to.be.false;
          expect(status.consent_required, "consent required").to.be.true;
          expect(status.api_server, "api_server").to.be.null;
        });
        authorizeApp({});
        consentStatus("openid email").then((status) => {
          expect(status.authorized, "authorized").to.be.true;
          expect(status.consent_required, "consent required").to.be.false;
          expect(status.requested_oidc_scopes, "OIDC scopes").to.deep.equal([
            "openid",
            "email",
          ]);
        });
      });
    });

    it("puts only the consented API scopes on codes", () => {
      createSignedInUser().then((credentials) => {
        authorizeApp({
          scope: `openid ${BOTH}`,
          resource: API_SERVER_ID,
          approved_api_scopes: [NOTES_READ],
        });
        mintAuthorizationCode(credentials, `openid ${BOTH}`).then((minted) => {
          redeemForApi(minted).then((body) => {
            expect(body.scope, "scope").to.equal(`openid ${NOTES_READ}`);
          });
        });
      });
    });

    it("reports granted and pending scopes, and consenting again adds scopes", () => {
      createSignedInUser().then((credentials) => {
        authorizeApp({
          scope: `openid ${NOTES_READ}`,
          resource: API_SERVER_ID,
          approved_api_scopes: [NOTES_READ],
        });
        consentStatus(`openid ${BOTH}`, API_SERVER_ID).then((status) => {
          expect(status.authorized, "authorized").to.be.true;
          expect(status.consent_required, "consent required").to.be.true;
          expect(status.api_server?.api_server_id, "api_server").to.equal(
            API_SERVER_ID,
          );
          expect(scopeValues(status.granted_api_scopes), "granted").to.deep.equal([
            NOTES_READ,
          ]);
          expect(scopeValues(status.pending_api_scopes), "pending").to.deep.equal([
            NOTES_WRITE,
          ]);
          expect(status.pending_api_scopes[0]?.description, "description").to.equal(
            DEFINED_SCOPES[NOTES_WRITE],
          );
        });
        consentStatus(`openid ${NOTES_READ}`, API_SERVER_ID).then((status) => {
          expect(status.consent_required, "nothing new asked").to.be.false;
        });

        authorizeApp({
          scope: `openid ${BOTH}`,
          resource: API_SERVER_ID,
          approved_api_scopes: [NOTES_WRITE],
        });
        consentStatus(`openid ${BOTH}`, API_SERVER_ID).then((status) => {
          expect(status.consent_required, "consent required").to.be.false;
          expect(scopeValues(status.granted_api_scopes), "granted").to.deep.equal([
            NOTES_READ,
            NOTES_WRITE,
          ].sort());
        });
        mintAuthorizationCode(credentials, `openid ${BOTH}`).then((minted) => {
          redeemForApi(minted).then((body) => {
            expect(body.scope, "scope").to.equal(`openid ${BOTH}`);
          });
        });
      });
    });

    it("ignores approved scopes the request does not ask for", () => {
      createSignedInUser().then(() => {
        authorizeApp({
          scope: `openid ${NOTES_READ}`,
          resource: API_SERVER_ID,
          approved_api_scopes: [NOTES_READ, NOTES_WRITE],
        });
        consentStatus(`openid ${BOTH}`, API_SERVER_ID).then((status) => {
          expect(scopeValues(status.pending_api_scopes), "pending").to.deep.equal([
            NOTES_WRITE,
          ]);
        });
      });
    });

    it("grants no API scope when the user approved none", () => {
      createSignedInUser().then((credentials) => {
        authorizeApp({});
        consentStatus(`openid ${NOTES_READ}`, API_SERVER_ID).then((status) => {
          expect(status.authorized, "authorized").to.be.true;
          expect(status.consent_required, "consent required").to.be.true;
        });
        mintAuthorizationCode(credentials, `openid ${NOTES_READ}`).then(
          (minted) => {
            redeemForApi(minted).then((body) => {
              expect(body.scope, "scope").to.equal("openid");
            });
          },
        );
      });
    });
  });

  describe("per-app allowances", () => {
    afterEach(() => {
      loginAsSuperuser();
      setUserScopeRestriction(null);
      cy.logout();
    });

    it("drops scopes an app may not be granted from codes and the consent screen", () => {
      createSignedInUser().then((credentials) => {
        authorizeApp({
          scope: `openid ${NOTES_READ}`,
          resource: API_SERVER_ID,
          approved_api_scopes: [NOTES_READ],
        });

        loginAsSuperuser();
        setUserScopeRestriction([NOTES_WRITE]);
        cy.request<{ success: boolean; policy: { restrict_user_scopes: boolean; user_scopes: string[] } }>({
          method: "GET",
          url: POLICY_URL,
        }).then((response) => {
          expect(response.body.policy.restrict_user_scopes, "restricted").to.be.true;
          expect(response.body.policy.user_scopes, "user scopes").to.deep.equal([
            NOTES_WRITE,
          ]);
        });
        cy.logout();

        cy.login(credentials.email, credentials.password);
        consentStatus(`openid ${NOTES_READ}`, API_SERVER_ID).then((status) => {
          expect(status.consent_required, "nothing grantable to ask for").to.be
            .false;
          expect(status.pending_api_scopes, "pending").to.deep.equal([]);
          expect(status.granted_api_scopes, "granted").to.deep.equal([]);
        });
        mintAuthorizationCode(credentials, `openid ${NOTES_READ}`).then(
          (minted) => {
            redeemForApi(minted).then((body) => {
              expect(body.scope, "scope").to.equal("openid");
            });
          },
        );
      });
    });

    it("lets only the API server's managers change allowances", () => {
      createSignedInUser().then(() => {
        cy.request({ method: "GET", url: POLICY_URL, failOnStatusCode: false }).then(
          (response) => {
            expect(response.status, "view as regular user").to.equal(403);
          },
        );
        cy.request({
          method: "PUT",
          url: POLICY_URL,
          body: { restrict_user_scopes: true, user_scopes: [], service_account_scopes: [] },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "update as regular user").to.equal(403);
        });
      });

      loginAsSuperuser();
      cy.request({
        method: "PUT",
        url: POLICY_URL,
        body: {
          restrict_user_scopes: true,
          user_scopes: ["example:undefined"],
          service_account_scopes: [],
        },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "unknown scope").to.equal(400);
      });
      cy.request({
        method: "GET",
        url: `/api/apis/${API_SERVER_ID}/connect_app/not-an-app-${Date.now()}/scopes`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "unknown app").to.equal(404);
      });
      cy.logout();
    });
  });

  describe("prompt", () => {
    it("prompt=none answers login_required without a session", () => {
      logoutIfAuthenticated();
      authorizeRequest({ scope: "openid", prompt: "none", state: "s-login" }).then(
        ({ location }) => {
          expectRedirectError(location, "login_required", "s-login");
        },
      );
    });

    it("prompt=none returns a code when nothing needs consent", () => {
      createSignedInUser().then(() => {
        authorizeApp({
          scope: `openid ${NOTES_READ}`,
          resource: API_SERVER_ID,
          approved_api_scopes: [NOTES_READ],
        });
        authorizeRequest({
          scope: `openid ${NOTES_READ}`,
          prompt: "none",
          state: "s-silent",
        }).then(({ location, code_verifier }) => {
          expect(`${location.origin}${location.pathname}`, "client").to.equal(
            REDIRECT_URI,
          );
          expect(location.searchParams.get("state"), "state").to.equal("s-silent");
          expect(location.searchParams.get("iss"), "iss").to.be.a("string");
          const code = location.searchParams.get("code");
          expect(code, "code").to.be.a("string");
          redeemForApi({ code: code as string, code_verifier }).then((body) => {
            expect(body.scope, "scope").to.equal(`openid ${NOTES_READ}`);
          });
        });
      });
    });

    it("prompt=none answers consent_required for pending scopes and unauthorized apps", () => {
      createSignedInUser().then(() => {
        authorizeRequest({ scope: "openid", prompt: "none", state: "s-new" }).then(
          ({ location }) => {
            expectRedirectError(location, "consent_required", "s-new");
          },
        );
        authorizeApp({
          scope: `openid ${NOTES_READ}`,
          resource: API_SERVER_ID,
          approved_api_scopes: [NOTES_READ],
        });
        authorizeRequest({
          scope: `openid ${BOTH}`,
          prompt: "none",
          state: "s-more",
        }).then(({ location }) => {
          expectRedirectError(location, "consent_required", "s-more");
        });
      });
    });

    it("prompt=none answers interaction_required until the e-mail address is verified", () => {
      createSignedInUser({ verified: false }).then(() => {
        authorizeApp({});
        authorizeRequest({ scope: "openid", prompt: "none", state: "s-verify" }).then(
          ({ location }) => {
            expectRedirectError(location, "interaction_required", "s-verify");
          },
        );
      });
    });

    it("refuses prompt=none combined with other values", () => {
      logoutIfAuthenticated();
      authorizeRequest({
        scope: "openid",
        prompt: "none consent",
        state: "s-combined",
      }).then(({ location }) => {
        expectRedirectError(location, "invalid_request", "s-combined");
      });
    });

    it("forwards prompt=consent to the login UI", () => {
      logoutIfAuthenticated();
      authorizeRequest({ scope: "openid", prompt: "consent" }).then(({ location }) => {
        expect(location.pathname, "bridge").to.equal("/auth/login");
        expect(location.searchParams.get("prompt"), "prompt").to.equal("consent");
      });
    });
  });

  describe("third-party access API", () => {
    it("lists connected apps, withdraws a scope, and removing the app drops its consents", () => {
      createSignedInUser().then((credentials) => {
        authorizeApp({
          scope: `openid ${NOTES_READ}`,
          resource: API_SERVER_ID,
          approved_api_scopes: [NOTES_READ],
        });
        mintAuthorizationCode(credentials, `openid ${NOTES_READ}`).then((minted) => {
          redeemForApi(minted).then((tokens) => {
            expect(tokens.scope, "scope before withdrawal").to.equal(
              `openid ${NOTES_READ}`,
            );
            listConnectedApps().then((list) => {
              const app = list.find((a) => a.app_id === CLIENT_ID);
              expect(app, "example app listed").to.exist;
              expect(app?.last_used_at, "last used").to.be.a("number");
              expect(app?.api_scopes.map((s) => s.scope), "scopes").to.deep.equal([
                NOTES_READ,
              ]);
              expect(app?.api_scopes[0]?.api_server_id, "api server").to.equal(
                API_SERVER_ID,
              );
              const scope_id = app?.api_scopes[0]?.api_server_scope_id as string;
              const url = `/api/me/connected-apps/${CLIENT_ID}/scopes/${scope_id}`;

              cy.request<{ was_granted: boolean; revoked_token_count: number }>({
                method: "DELETE",
                url,
              }).then((response) => {
                expect(response.status, "withdraw status").to.equal(200);
                expect(response.body.was_granted, "was granted").to.be.true;
                expect(
                  response.body.revoked_token_count,
                  "revoked access tokens",
                ).to.be.at.least(1);
              });
              cy.request<{ was_granted: boolean }>({ method: "DELETE", url }).then(
                (again) => {
                  expect(again.body.was_granted, "second withdrawal").to.be.false;
                },
              );

              // The refresh token still holds the scope; tokens minted from
              // it for the API server no longer carry it.
              postTokenRequest({
                grant_type: "refresh_token",
                refresh_token: tokens.refresh_token as string,
                resource: API_SERVER_ID,
              }).then((refreshed) => {
                expect(refreshed.status, "refresh status").to.equal(200);
                expect(refreshed.body.scope, "scope after withdrawal").to.equal(
                  "openid",
                );
              });
            });
          });
        });

        cy.request({ method: "DELETE", url: `/api/apps/${CLIENT_ID}/authorize` });
        listConnectedApps().then((list) => {
          expect(list.some((a) => a.app_id === CLIENT_ID), "app removed").to.be
            .false;
        });
        // Consent again: the earlier scope grants went with the authorization.
        authorizeApp({
          scope: `openid ${BOTH}`,
          resource: API_SERVER_ID,
          approved_api_scopes: [NOTES_WRITE],
        });
        listConnectedApps().then((list) => {
          const app = list.find((a) => a.app_id === CLIENT_ID);
          expect(app?.api_scopes.map((s) => s.scope), "scopes").to.deep.equal([
            NOTES_WRITE,
          ]);
        });
      });
    });

    it("requires a session", () => {
      logoutIfAuthenticated();
      cy.request({
        method: "GET",
        url: "/api/me/connected-apps",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "status").to.equal(401);
      });
    });
  });

  describe("UI", () => {
    it("lets the user untick API scopes on the consent screen", () => {
      createSignedInUser().then(() => {
        cy.intercept("POST", `/api/apps/${CLIENT_ID}/authorize`).as("authorizeApp");
        // Stub the client's callback: the code is redeemed below.
        cy.intercept(
          { method: "GET", url: `${REDIRECT_URI}*` },
          {
            statusCode: 200,
            headers: { "content-type": "text/html" },
            body: "<html><body>callback</body></html>",
          },
        ).as("callback");

        createPkcePair().then(({ code_verifier, challenge }) => {
          const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: "code",
            code_challenge: challenge.code_challenge,
            code_challenge_method: "S256",
            state: `e2e-ui-${Date.now()}`,
            scope: `openid ${BOTH}`,
            resource: API_SERVER_ID,
          });
          cy.visit(`${AUTHORIZE_ENDPOINT}?${params.toString()}`);

          cy.get('[data-testid="consent-api-scope-checkbox"]', { timeout: 20000 })
            .should("have.length", 2);
          cy.get(
            `[data-testid="consent-api-scope-checkbox"][data-scope="${NOTES_WRITE}"]`,
          )
            .should("have.attr", "data-state", "checked")
            .click()
            .should("have.attr", "data-state", "unchecked");
          cy.get('[data-testid="consent-authorize-button"]')
            .should("not.be.disabled")
            .click();

          cy.wait("@authorizeApp").then((interception) => {
            expect(
              (interception.request.body as { approved_api_scopes?: string[] })
                .approved_api_scopes,
              "approved",
            ).to.deep.equal([NOTES_READ]);
          });
          cy.wait("@callback", { timeout: 20000 }).then((interception) => {
            const code = new URL(interception.request.url).searchParams.get("code");
            expect(code, "code").to.be.a("string");
            redeemForApi({ code: code as string, code_verifier }).then((body) => {
              expect(body.scope, "scope").to.equal(`openid ${NOTES_READ}`);
            });
          });
        });
      });
    });

    it("withdraws a scope and removes an app on the third-party access page", () => {
      createSignedInUser().then(() => {
        authorizeApp({
          scope: `openid ${BOTH}`,
          resource: API_SERVER_ID,
          approved_api_scopes: [NOTES_READ, NOTES_WRITE],
        });
        cy.visit("/account");
        // Server-rendered buttons do nothing until React has hydrated them.
        cy.wait_for_page_hydration();
        cy.get('[data-testid="manage-connected-apps-link"]', { timeout: 20000 }).click();
        cy.location("pathname").should("equal", "/account/connected-apps");
        cy.wait_for_page_hydration();

        const app = `[data-testid="connected-app"][data-app-id="${CLIENT_ID}"]`;
        cy.get(`${app} [data-testid="connected-app-scope"]`, { timeout: 20000 })
          .should("have.length", 2);
        cy.get(`${app} [data-testid="connected-app-scope"][data-scope="${NOTES_WRITE}"] button`)
          .click();
        cy.get('[data-testid="confirm-revoke-connected-app"]').click();
        cy.get(`${app} [data-testid="connected-app-scope"]`, { timeout: 20000 })
          .should("have.length", 1)
          .and("have.attr", "data-scope", NOTES_READ);

        cy.get(`[data-testid="remove-app-access-${CLIENT_ID}"]`).click();
        cy.get('[data-testid="confirm-revoke-connected-app"]').click();
        cy.get(app, { timeout: 20000 }).should("not.exist");
        consentStatus().then((status) => {
          expect(status.authorized, "authorized").to.be.false;
        });
      });
    });

    it("edits an app's scope allowances on the API server page", () => {
      loginAsSuperuser();
      cy.request<{ success: boolean; list: ApiServerScopeBody[] }>({
        method: "GET",
        url: SCOPES_URL,
      }).then((listed) => {
        const read = listed.body.list.find((row) => row.scope === NOTES_READ);
        cy.visit(`/apis/${API_SERVER_ID}`);
        // The allowances button is server-rendered: clicking it before
        // hydration opens nothing.
        cy.wait_for_page_hydration();
        cy.get(`[data-testid="app-scope-allowances-${CLIENT_ID}"]`, { timeout: 20000 })
          .click();
        cy.get('[data-testid="app-scope-allowances-dialog"]', { timeout: 20000 })
          .should("be.visible");
        cy.get(`[data-testid="service-account-scope-${read?.api_server_scope_id}"]`, {
          timeout: 20000,
        }).click();
        cy.get('[data-testid="save-app-scope-allowances"]').click();
        cy.get('[data-testid="app-scope-allowances-dialog"]').should("not.exist");
        cy.request<{ success: boolean; policy: { service_account_scopes: string[] } }>({
          method: "GET",
          url: POLICY_URL,
        }).then((response) => {
          expect(response.body.policy.service_account_scopes, "saved").to.deep.equal([
            NOTES_READ,
          ]);
        });
        setUserScopeRestriction(null);
      });
      cy.logout();
    });
  });
});
