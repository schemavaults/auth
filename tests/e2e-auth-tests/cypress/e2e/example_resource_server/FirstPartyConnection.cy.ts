// FirstPartyConnection.cy.ts
//
// First-party app-to-API connections
// (`/api/apis/{api_server_id}/connect_app/{client_app_id}/first-party`):
// when a platform administrator marks a connection first-party, users
// signing in to the app for the API server (the authorization request's
// RFC 8707 `resource`) consent implicitly:
//   - `check-authorization` reports no consent required, even before the
//     user ever authorized the app;
//   - codes minted at login / registration / `prompt=none` carry every
//     requested API scope the app may be granted, and minting them records
//     the app authorization and the scope consents (third-party access
//     page);
//   - requests naming none of the API server's scopes behave as before;
//   - the connection's user allowance still applies;
//   - turning it off asks again for anything not consented yet;
//   - only platform administrators may set it: not even the owner of both
//     the app and the API server (who may connect them, and may view the
//     flag) can make their own connection first-party;
//   - the authorize endpoint skips the consent screen, and the flag is
//     shown and edited on the API server page.
//
// The example app and API server (the same id) are seeded in
// cypress.config.ts's before:run hook; the app is connected to its API.
// Per-scope consent of non-first-party connections is covered by
// ApiScopeConsent.cy.ts.

import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

interface OidcTokenResponseBody {
  access_token?: string;
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
  api_server: { api_server_id: string; api_server_name: string } | null;
  granted_api_scopes: ConsentScopeBody[];
  pending_api_scopes: ConsentScopeBody[];
}

interface ConnectedAppBody {
  app_id: string;
  api_scopes: (ConsentScopeBody & { api_server_id: string })[];
}

interface FirstPartyResponseBody {
  success: boolean;
  first_party?: boolean;
  message?: string;
}

interface AuthenticateResponseBody {
  kind?: string;
  authorization_code?: string;
}

interface Credentials {
  email: string;
  password: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("First-party app-to-API connections (implicit consent)", () => {
  const AUTHORIZE_ENDPOINT = "/api/oidc/authorize";
  const TOKEN_ENDPOINT = "/api/oidc/token";
  const EMAIL_VERIFICATION_SETTING = "require_email_verification_for_third_party_apps";

  const CLIENT_ID = "00000000-0000-0000-0000-000000000000";
  const API_SERVER_ID = "00000000-0000-0000-0000-000000000000";
  const SCOPES_URL = `/api/apis/${API_SERVER_ID}/scopes`;
  const POLICY_URL = `/api/apis/${API_SERVER_ID}/connect_app/${CLIENT_ID}/scopes`;
  const FIRST_PARTY_URL = `/api/apis/${API_SERVER_ID}/connect_app/${CLIENT_ID}/first-party`;

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

  /** PUT the first-party flag as the signed-in user. */
  function putFirstParty(
    body: Record<string, unknown>,
  ): Cypress.Chainable<Cypress.Response<FirstPartyResponseBody>> {
    return cy.request<FirstPartyResponseBody>({
      method: "PUT",
      url: FIRST_PARTY_URL,
      body,
      failOnStatusCode: false,
    });
  }

  /** Sets the flag as the superuser and signs out. */
  function setFirstParty(first_party: boolean): void {
    loginAsSuperuser();
    putFirstParty({ first_party }).then((response) => {
      expect(response.status, "set first-party status").to.equal(200);
      expect(response.body.first_party, "first_party").to.equal(first_party);
    });
    cy.logout();
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

  /** A fresh, signed-in user with a verified e-mail address. */
  function createSignedInUser(): Cypress.Chainable<Credentials> {
    logoutIfAuthenticated();
    return cy.generate_random_test_user_credentials().then((credentials) =>
      cy.create_and_login_as_regular_user_via_request(credentials).then((success) => {
        expect(success, "create_and_login_as_regular_user_via_request should succeed").to.be
          .true;
        cy.verify_email_via_request(credentials.email).then((verified: boolean) => {
          expect(verified, "email verified").to.be.true;
        });
        return cy.wrap<Credentials>(credentials, { log: false });
      }),
    );
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

  /** Mints an authorization code through the login API (signs the user in). */
  function mintAuthorizationCode(
    credentials: Credentials,
    scope: string,
  ): Cypress.Chainable<{ code: string; code_verifier: string }> {
    return createPkcePair().then(({ code_verifier, challenge }) =>
      cy
        .request<AuthenticateResponseBody>({
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
          expect(response.body.kind, "login kind").to.equal("authenticated");
          return { code: response.body.authorization_code as string, code_verifier };
        }),
    );
  }

  /** Redeems a code for an access token for the example API server. */
  function redeemForApi(minted: {
    code: string;
    code_verifier: string;
  }): Cypress.Chainable<OidcTokenResponseBody> {
    return cy
      .request<OidcTokenResponseBody>({
        method: "POST",
        url: TOKEN_ENDPOINT,
        form: true,
        body: {
          client_id: CLIENT_ID,
          grant_type: "authorization_code",
          code: minted.code,
          code_verifier: minted.code_verifier,
          redirect_uri: REDIRECT_URI,
          resource: API_SERVER_ID,
        },
        headers: { Accept: "application/json" },
        failOnStatusCode: false,
      })
      .then((response) => {
        expect(response.status, "code grant status").to.equal(200);
        return response.body;
      });
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
    // Define the example API server's scopes (idempotent across runs) and
    // make its connection to the example app first-party.
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
    setFirstParty(true);
  });

  after(() => {
    // Leave the seeded API server as other specs expect it: not first-party,
    // no scopes (their consents go with them) and no restriction.
    loginAsSuperuser();
    putFirstParty({ first_party: false }).then((response) => {
      expect(response.status, "reset first-party status").to.equal(200);
    });
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

  describe("management API", () => {
    it("lets platform administrators turn it on and off", () => {
      loginAsSuperuser();
      putFirstParty({ first_party: false }).then((response) => {
        expect(response.status, "turn off").to.equal(200);
        expect(response.body.first_party, "off").to.be.false;
      });
      cy.request<FirstPartyResponseBody>(FIRST_PARTY_URL).then((response) => {
        expect(response.body.first_party, "read back off").to.be.false;
      });
      putFirstParty({ first_party: true }).then((response) => {
        expect(response.status, "turn on").to.equal(200);
        expect(response.body.first_party, "on").to.be.true;
      });
      cy.request<FirstPartyResponseBody>(FIRST_PARTY_URL).then((response) => {
        expect(response.body.first_party, "read back on").to.be.true;
      });
      putFirstParty({ first_party: "yes" }).then((response) => {
        expect(response.status, "malformed body").to.equal(400);
      });
      putFirstParty({ first_party: true, extra: 1 }).then((response) => {
        expect(response.status, "unknown key").to.equal(400);
      });
      cy.logout();
    });

    it("refuses everyone else", () => {
      createSignedInUser().then(() => {
        putFirstParty({ first_party: false }).then((response) => {
          expect(response.status, "PUT as a regular user").to.equal(403);
        });
        cy.request({ url: FIRST_PARTY_URL, failOnStatusCode: false }).then((response) => {
          // The user manages neither the API server nor the app.
          expect(response.status, "GET as a regular user").to.equal(403);
        });
      });
      logoutIfAuthenticated();
      putFirstParty({ first_party: false }).then((response) => {
        expect(response.status, "PUT without a session").to.equal(401);
      });
    });

    it("refuses the owner of both the app and the API server, who may still view it", () => {
      const suffix = Math.random().toString(36).slice(2, 12);
      const organization_id = `e2e-fp-org-${suffix}`;
      const app_id = `e2e-fp-app-${suffix}`;
      const api_server_id = `e2e-fp-api-${suffix}`;
      const url = `/api/apis/${api_server_id}/connect_app/${app_id}/first-party`;
      const ownership = { owner_type: "organization", owner_organization_id: organization_id };

      // A regular user who owns an organization, and the app and API server
      // it owns: everything needed to connect them.
      createSignedInUser().then(() => {
        cy.create_organization_via_request({
          organization_id,
          name: `First-party owner ${suffix}`,
        });
        cy.request({
          method: "POST",
          url: "/api/apps",
          body: {
            app_id,
            app_name: `First-party owner app ${suffix}`,
            app_description: "FirstPartyConnection.cy.ts",
            created_at: Date.now(),
            public: false,
            hardcoded: false,
            web: true,
            ...ownership,
          },
        }).then((response) => expect(response.status, "create app").to.equal(200));
        cy.request({
          method: "POST",
          url: "/api/apis",
          body: {
            api_server_id,
            api_server_name: `First-party owner API ${suffix}`,
            api_server_description: "FirstPartyConnection.cy.ts",
            created_at: Date.now(),
            public: false,
            hardcoded: false,
            ...ownership,
          },
        }).then((response) => expect(response.status, "create API server").to.equal(200));
        cy.request({
          method: "POST",
          url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
        }).then((response) => {
          expect(response.status, "the owner of both may connect them").to.equal(200);
        });

        cy.request<FirstPartyResponseBody>(url).then((response) => {
          expect(response.status, "the owner may view the flag").to.equal(200);
          expect(response.body.first_party, "off by default").to.be.false;
        });
        cy.request<FirstPartyResponseBody>({
          method: "PUT",
          url,
          body: { first_party: true },
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, "the owner may not make it first-party").to.equal(403);
          expect(response.body.success, "success").to.be.false;
        });
        cy.request<FirstPartyResponseBody>(url).then((response) => {
          expect(response.body.first_party, "still off").to.be.false;
        });
      });
      logoutIfAuthenticated();
    });

    it("answers 404 for an app that is not connected to the API server", () => {
      const app_id = `e2e-fp-unconnected-${Math.random().toString(36).slice(2, 12)}`;
      loginAsSuperuser();
      cy.request({
        method: "POST",
        url: "/api/apps",
        body: {
          app_id,
          app_name: `First-party unconnected ${app_id}`,
          app_description: "FirstPartyConnection.cy.ts",
          created_at: Date.now(),
          public: false,
          hardcoded: false,
          web: true,
        },
      }).then((response) => expect(response.status, "create app").to.equal(200));
      cy.request<FirstPartyResponseBody>({
        method: "PUT",
        url: `/api/apis/${API_SERVER_ID}/connect_app/${app_id}/first-party`,
        body: { first_party: true },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "PUT for an unconnected app").to.equal(404);
      });
      cy.request({
        url: `/api/apis/${API_SERVER_ID}/connect_app/${app_id}/first-party`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "GET for an unconnected app").to.equal(404);
      });
      cy.logout();
    });
  });

  describe("implicit consent", () => {
    it("needs no consent and puts every requested API scope on codes", () => {
      createSignedInUser().then((credentials) => {
        consentStatus(`openid ${BOTH}`, API_SERVER_ID).then((status) => {
          expect(status.authorized, "not authorized yet").to.be.false;
          expect(status.consent_required, "consent required").to.be.false;
          expect(status.api_server?.api_server_id, "api_server").to.equal(API_SERVER_ID);
          expect(scopeValues(status.pending_api_scopes), "pending").to.deep.equal([]);
          expect(scopeValues(status.granted_api_scopes), "granted").to.deep.equal(
            [NOTES_READ, NOTES_WRITE].sort(),
          );
        });
        mintAuthorizationCode(credentials, `openid ${BOTH}`).then((minted) => {
          redeemForApi(minted).then((body) => {
            expect(body.scope, "scope").to.equal(`openid ${BOTH}`);
            expect(body.access_token, "access token").to.be.a("string");
          });
        });
        // Minting the code recorded the implicit consent.
        consentStatus(`openid ${BOTH}`, API_SERVER_ID).then((status) => {
          expect(status.authorized, "authorized").to.be.true;
          expect(status.consent_required, "consent required").to.be.false;
        });
        listConnectedApps().then((list) => {
          const app = list.find((row) => row.app_id === CLIENT_ID);
          expect(app, "listed on the third-party access page").to.exist;
          expect(scopeValues(app!.api_scopes), "recorded scopes").to.deep.equal(
            [NOTES_READ, NOTES_WRITE].sort(),
          );
        });
      });
    });

    it("still asks for requests that name none of the API server's scopes", () => {
      createSignedInUser().then(() => {
        consentStatus("openid email").then((status) => {
          expect(status.consent_required, "no resource").to.be.true;
          expect(status.api_server, "api_server").to.be.null;
        });
        consentStatus("openid email", API_SERVER_ID).then((status) => {
          expect(status.consent_required, "resource but no API scope").to.be.true;
        });
      });
    });

    it("keeps to the connection's user allowance", () => {
      loginAsSuperuser();
      setUserScopeRestriction([NOTES_READ]);
      cy.logout();
      createSignedInUser().then((credentials) => {
        consentStatus(`openid ${BOTH}`, API_SERVER_ID).then((status) => {
          expect(status.consent_required, "consent required").to.be.false;
          expect(scopeValues(status.granted_api_scopes), "granted").to.deep.equal([NOTES_READ]);
        });
        mintAuthorizationCode(credentials, `openid ${BOTH}`).then((minted) => {
          redeemForApi(minted).then((body) => {
            expect(body.scope, "scope").to.equal(`openid ${NOTES_READ}`);
          });
        });
      });
      loginAsSuperuser();
      setUserScopeRestriction(null);
      cy.logout();
    });

    it("answers prompt=none with a code for a user who never authorized the app", () => {
      createSignedInUser().then(() => {
        createPkcePair().then(({ code_verifier, challenge }) => {
          const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: "code",
            code_challenge: challenge.code_challenge,
            code_challenge_method: "S256",
            state: "s-first-party",
            scope: `openid ${BOTH}`,
            resource: API_SERVER_ID,
            prompt: "none",
          });
          cy.request({
            url: `${AUTHORIZE_ENDPOINT}?${params.toString()}`,
            followRedirect: false,
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "authorize status").to.equal(302);
            const location = new URL(response.headers["location"] as string);
            expect(`${location.origin}${location.pathname}`, "client").to.equal(REDIRECT_URI);
            expect(location.searchParams.get("error"), "error").to.be.null;
            expect(location.searchParams.get("state"), "state").to.equal("s-first-party");
            const code = location.searchParams.get("code");
            expect(code, "code").to.be.a("string");
            redeemForApi({ code: code as string, code_verifier }).then((body) => {
              expect(body.scope, "scope").to.equal(`openid ${BOTH}`);
            });
          });
        });
      });
    });

    describe("at registration", () => {
      function setRequireEmailVerification(enabled: boolean): void {
        loginAsSuperuser();
        cy.request({
          method: "PATCH",
          url: `/api/admin/settings/${EMAIL_VERIFICATION_SETTING}`,
          body: { value: enabled },
        }).then((response) => {
          expect(response.status, `set ${EMAIL_VERIFICATION_SETTING}=${enabled}`).to.equal(200);
        });
        cy.logout();
      }

      // Registration hands a third-party app a code only for a verified
      // address unless the server setting is off.
      before(() => {
        setRequireEmailVerification(false);
      });

      after(() => {
        setRequireEmailVerification(true);
      });

      /** A single-use invite code when registration needs one (signs out). */
      function inviteCodeIfRequired(): Cypress.Chainable<string | undefined> {
        return cy.is_invite_code_required().then((required: boolean) => {
          if (!required) {
            return cy.wrap<string | undefined>(undefined, { log: false });
          }
          loginAsSuperuser();
          return cy.generate_random_code(24).then((invite_code: string) =>
            cy.create_invite_code_via_request(invite_code, 1).then(() => {
              cy.logout();
              return cy.wrap<string | undefined>(invite_code, { log: false });
            }),
          );
        });
      }

      it("grants the API scopes to a code minted at registration", () => {
        logoutIfAuthenticated();
        inviteCodeIfRequired().then((invite_code: string | undefined) => {
          cy.generate_random_test_user_credentials().then((credentials) => {
            createPkcePair().then(({ code_verifier, challenge }) => {
              cy.request<AuthenticateResponseBody>({
                method: "POST",
                url: "/api/auth/register",
                body: {
                  credentials: { email: credentials.email, password: credentials.password },
                  ...(invite_code ? { invite_code } : {}),
                  client_app_id: CLIENT_ID,
                  code_challenge: challenge.code_challenge,
                  challenge_time: challenge.challenge_time,
                  redirect_uri: REDIRECT_URI,
                  scope: `openid ${BOTH}`,
                  resource: API_SERVER_ID,
                },
              }).then((response) => {
                expect(response.body.kind, "register kind").to.equal("authenticated");
                redeemForApi({
                  code: response.body.authorization_code as string,
                  code_verifier,
                }).then((body) => {
                  expect(body.scope, "scope").to.equal(`openid ${BOTH}`);
                });
              });
            });
          });
        });
      });
    });

    it("asks again for anything not consented once it is turned off", () => {
      createSignedInUser().then((credentials) => {
        // Implicitly consents to NOTES_READ only.
        mintAuthorizationCode(credentials, `openid ${NOTES_READ}`).then((minted) => {
          redeemForApi(minted).then((body) => {
            expect(body.scope, "scope").to.equal(`openid ${NOTES_READ}`);
          });
        });
        setFirstParty(false);
        cy.login_via_request(credentials.email, credentials.password).then((ok: boolean) => {
          expect(ok, "signed back in").to.be.true;
        });
        consentStatus(`openid ${BOTH}`, API_SERVER_ID).then((status) => {
          expect(status.authorized, "authorized").to.be.true;
          expect(status.consent_required, "consent required").to.be.true;
          expect(scopeValues(status.granted_api_scopes), "granted").to.deep.equal([NOTES_READ]);
          expect(scopeValues(status.pending_api_scopes), "pending").to.deep.equal([NOTES_WRITE]);
        });
        mintAuthorizationCode(credentials, `openid ${BOTH}`).then((minted) => {
          redeemForApi(minted).then((body) => {
            expect(body.scope, "only the consented scope").to.equal(`openid ${NOTES_READ}`);
          });
        });
      });
      setFirstParty(true);
    });
  });

  describe("UI", () => {
    function authorizeQuery(challenge: CodeChallengeWithDetails, state: string): string {
      return new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        code_challenge: challenge.code_challenge,
        code_challenge_method: "S256",
        state,
        scope: `openid ${BOTH}`,
        resource: API_SERVER_ID,
      }).toString();
    }

    it("sends a signed-in user straight back to the app from the authorize endpoint", () => {
      // The whole hand-off is server-side redirects (authorize → /auth/login
      // → the client's callback), which cy.visit() follows itself without
      // cy.intercept() stubs, so follow them one at a time instead.
      createSignedInUser().then(() => {
        createPkcePair().then(({ code_verifier, challenge }) => {
          cy.request({
            url: `${AUTHORIZE_ENDPOINT}?${authorizeQuery(challenge, "s-signed-in")}`,
            followRedirect: false,
            failOnStatusCode: false,
          }).then((bridged) => {
            expect(bridged.status, "authorize bridges to the login UI").to.equal(302);
            const loginPage = new URL(bridged.headers["location"] as string, Cypress.config("baseUrl") ?? undefined);
            expect(loginPage.pathname, "login UI").to.equal("/auth/login");
            cy.request({
              url: loginPage.toString(),
              followRedirect: false,
              failOnStatusCode: false,
            }).then((page) => {
              // A redirect rather than the consent screen.
              expect(page.status, "login page redirects").to.be.within(300, 399);
              const callback = new URL(page.headers["location"] as string);
              expect(`${callback.origin}${callback.pathname}`, "client callback").to.equal(
                REDIRECT_URI,
              );
              expect(callback.searchParams.get("state"), "state").to.equal("s-signed-in");
              const code = callback.searchParams.get("code");
              expect(code, "code").to.be.a("string");
              redeemForApi({ code: code as string, code_verifier }).then((body) => {
                expect(body.scope, "scope").to.equal(`openid ${BOTH}`);
              });
            });
          });
        });
      });
    });

    it("skips the consent screen after signing in through the login form", () => {
      createSignedInUser().then((credentials) => {
        // Signed out of the auth server, so the login form is shown.
        cy.logout();
        cy.intercept("POST", `/api/apps/${CLIENT_ID}/authorize`).as("authorizeApp");
        // Stub the client's callback (the form navigates there in the
        // browser): the code is redeemed below.
        cy.intercept(
          { method: "GET", url: `${REDIRECT_URI}*` },
          {
            statusCode: 200,
            headers: { "content-type": "text/html" },
            body: "<html><body>callback</body></html>",
          },
        ).as("callback");

        createPkcePair().then(({ code_verifier, challenge }) => {
          cy.visit(`${AUTHORIZE_ENDPOINT}?${authorizeQuery(challenge, `e2e-first-party-ui-${Date.now()}`)}`);
          cy.location("pathname", { timeout: 20000 }).should("equal", "/auth/login");
          cy.wait_for_page_hydration();
          cy.get("input[name='email']").should("be.visible").type(credentials.email, { force: true });
          cy.get("input[name='password']")
            .should("be.visible")
            .type(credentials.password, { force: true });
          cy.get("button[type='submit']").should("not.be.disabled").click();

          cy.wait("@callback", { timeout: 30000 }).then((interception) => {
            const code = new URL(interception.request.url).searchParams.get("code");
            expect(code, "code").to.be.a("string");
            redeemForApi({ code: code as string, code_verifier }).then((body) => {
              expect(body.scope, "scope").to.equal(`openid ${BOTH}`);
            });
          });
          // The consent screen never asked anything.
          cy.get("@authorizeApp.all").should("have.length", 0);
        });
      });
    });

    it("shows and edits the flag on the API server page", () => {
      loginAsSuperuser();
      putFirstParty({ first_party: false });
      cy.visit(`/apis/${API_SERVER_ID}`);
      // The allowances button is server-rendered: clicking it before
      // hydration opens nothing.
      cy.wait_for_page_hydration();
      cy.get(`[data-testid="first-party-connection-badge-${CLIENT_ID}"]`).should("not.exist");
      cy.get(`[data-testid="app-scope-allowances-${CLIENT_ID}"]`, { timeout: 20000 }).click();
      cy.get('[data-testid="app-scope-allowances-dialog"]', { timeout: 20000 }).should(
        "be.visible",
      );
      cy.get('[data-testid="first-party-connection-switch"]', { timeout: 20000 })
        .should("have.attr", "data-state", "unchecked")
        .and("not.be.disabled")
        .click()
        .should("have.attr", "data-state", "checked");
      cy.get('[data-testid="save-app-scope-allowances"]').click();
      cy.get('[data-testid="app-scope-allowances-dialog"]').should("not.exist");
      cy.get(`[data-testid="first-party-connection-badge-${CLIENT_ID}"]`, {
        timeout: 20000,
      }).should("be.visible");
      cy.request<FirstPartyResponseBody>(FIRST_PARTY_URL).then((response) => {
        expect(response.body.first_party, "saved").to.be.true;
      });
      cy.logout();
    });
  });
});
