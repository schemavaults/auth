// DynamicClientRegistration.cy.ts
//
// OAuth 2.0 Dynamic Client Registration (RFC 7591) at POST /api/oidc/register
// — the way OAuth-only clients such as MCP clients onboard themselves —
// driven end to end against the auth server and the example resource
// server:
//
//   - registration is OFF by default: the discovery document does not
//     advertise `registration_endpoint` and the endpoint refuses with
//     403 `access_denied`; an admin turns it on through the
//     `allow_dynamic_client_registration` server setting;
//   - metadata is validated per RFC 7591 §3.2.2: bad redirect URIs are
//     `invalid_redirect_uri`, unsupported values `invalid_client_metadata`;
//   - a public client (`token_endpoint_auth_method: none`) gets a
//     `client_id` and no secret; the RFC default (`client_secret_basic`)
//     gets a one-time `client_secret` that does not expire;
//   - the registered client completes a plain OAuth 2.1 grant (no
//     `openid`): the user consents, a PKCE code is minted for one of the
//     registered loopback redirect URIs, and the token endpoint redeems
//     it with an RFC 8707 `resource` that names the example resource
//     server BY URL. The API server opted into dynamic clients (seeded
//     with `allow_dynamic_clients` + `prefix` matching in
//     cypress.config.ts), so no app-to-API connection exists; the access
//     token's `aud` is the resource URL verbatim, and the example resource
//     server (configured to accept that URL) authenticates it;
//   - the client SDK's `registerDynamicClient()` helper drives one of the
//     registrations;
//   - only administrators can see the ownerless client in the app list.
//
// The suite runs with the `e2e_with_resource_server` compose profile (see
// e2e-auth-tests-cli.ts `suiteNeedsExampleResourceServer`).

import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
  type DynamicClientRegistrationResponse,
} from "@schemavaults/auth-common";
import {
  registerDynamicClient,
  DynamicClientRegistrationFailedError,
} from "@schemavaults/auth-client-sdk";

describe("Dynamic client registration (RFC 7591)", () => {
  const REGISTRATION_ENDPOINT = "/api/oidc/register";
  const DISCOVERY_ENDPOINT = "/.well-known/oauth-authorization-server";
  const AUTHORIZE_ENDPOINT = "/api/oidc/authorize";
  const TOKEN_ENDPOINT = "/api/oidc/token";
  const SETTING_KEY = "allow_dynamic_client_registration";

  // The example resource server's API server id (seeded in
  // cypress.config.ts's before:run hook with allow_dynamic_clients).
  const EXAMPLE_API_SERVER_ID = "00000000-0000-0000-0000-000000000000";

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;
  // The resource server identifies itself to clients by this URL (an MCP
  // server would advertise something like https://host/mcp). It is
  // matched against the seeded domain (the origin) by prefix, and the
  // resource server accepts it as a token audience through its
  // SCHEMAVAULTS_ACCEPTED_TOKEN_AUDIENCES env var (docker-compose.yml).
  const RESOURCE_URL = `${exampleAppOrigin}/api`;

  // RFC 8252 §7.3 loopback redirect: registered with one port, redeemed
  // on another (native clients bind an ephemeral port at runtime).
  const REGISTERED_LOOPBACK_REDIRECT_URI = "http://127.0.0.1:41234/callback";
  const RUNTIME_LOOPBACK_REDIRECT_URI = "http://127.0.0.1:53211/callback";
  const HTTPS_REDIRECT_URI = "https://client.example.com/oauth/callback";

  interface RegistrationErrorBody {
    error?: string;
    error_description?: string;
  }

  interface OidcTokenResponseBody {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  }

  interface DiscoveryDocument {
    issuer: string;
    registration_endpoint?: string;
  }

  function setRegistrationEnabled(enabled: boolean): void {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
    cy.request({
      method: "PATCH",
      url: `/api/admin/settings/${SETTING_KEY}`,
      body: { value: enabled },
    }).then((response) => {
      expect(response.status, `set ${SETTING_KEY}=${enabled}`).to.equal(200);
    });
    cy.logout();
  }

  function postRegistration(
    body: unknown,
  ): Cypress.Chainable<
    Cypress.Response<DynamicClientRegistrationResponse & RegistrationErrorBody>
  > {
    return cy.request<DynamicClientRegistrationResponse & RegistrationErrorBody>({
      method: "POST",
      url: REGISTRATION_ENDPOINT,
      body: body as Cypress.RequestBody,
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    });
  }

  function expectRegistrationError(
    response: Cypress.Response<RegistrationErrorBody>,
    error: string,
    label: string,
  ): void {
    expect(response.status, `${label}: status`).to.equal(400);
    expect(response.body.error, `${label}: error`).to.equal(error);
    expect(response.body.error_description, `${label}: error_description`).to
      .be.a("string").and.not.be.empty;
    expect(response.headers["cache-control"], `${label}: Cache-Control`).to.include(
      "no-store",
    );
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
   * Creates a fresh user, signs them in (session cookie), and records
   * their consent for the registered client — exactly what the consent
   * screen does when an unknown client sends the user to /auth/login.
   */
  function createUserAuthorizedForClient(client_id: string): Cypress.Chainable<{
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
            url: `/api/apps/${client_id}/authorize`,
            body: {},
          })
          .then((response) => {
            expect(response.status, "app authorization status").to.equal(200);
            return credentials;
          });
      }),
    );
  }

  /**
   * Mints a plain OAuth 2.1 (no scope) authorization code for the client
   * through the login API with a PKCE pair generated here.
   */
  function mintAuthorizationCode(opts: {
    client_id: string;
    email: string;
    password: string;
    redirect_uri: string;
  }): Cypress.Chainable<{ code: string; code_verifier: string }> {
    return createPkcePair().then(({ code_verifier, challenge }) =>
      cy
        .request({
          method: "POST",
          url: "/api/auth/login",
          failOnStatusCode: false,
          body: {
            credentials: { email: opts.email, password: opts.password },
            client_app_id: opts.client_id,
            code_challenge: challenge.code_challenge,
            challenge_time: challenge.challenge_time,
            redirect_uri: opts.redirect_uri,
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
          return { code: body.authorization_code as string, code_verifier };
        }),
    );
  }

  function postTokenRequest(
    params: Record<string, string>,
    auth?: { username: string; password: string },
  ): Cypress.Chainable<Cypress.Response<OidcTokenResponseBody>> {
    return cy.request<OidcTokenResponseBody>({
      method: "POST",
      url: TOKEN_ENDPOINT,
      form: true,
      body: params,
      headers: { Accept: "application/json" },
      ...(auth ? { auth } : {}),
      failOnStatusCode: false,
    });
  }

  /** Unverified JOSE header of a compact token (the auth server's JWE). */
  function decodeTokenHeader(token: string): Record<string, unknown> {
    const segment = token.split(".")[0] ?? "";
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as Record<string, unknown>;
  }

  beforeEach(() => {
    cy.reset_rate_limit();
  });

  after(() => {
    // Leave the deployment as we found it: registration off.
    setRegistrationEnabled(false);
  });

  describe("while disabled (the default)", () => {
    it("is not advertised by discovery and refuses registrations", () => {
      cy.request<DiscoveryDocument>({ url: DISCOVERY_ENDPOINT }).then(
        (discovery) => {
          expect(discovery.status, "discovery status").to.equal(200);
          expect(
            discovery.body.registration_endpoint,
            "registration_endpoint while disabled",
          ).to.be.undefined;
        },
      );
      postRegistration({ redirect_uris: [HTTPS_REDIRECT_URI] }).then(
        (response) => {
          expect(response.status, "status while disabled").to.equal(403);
          expect(response.body.error, "error while disabled").to.equal(
            "access_denied",
          );
        },
      );
    });
  });

  describe("once an administrator enables it", () => {
    before(() => {
      setRegistrationEnabled(true);
    });

    it("advertises registration_endpoint in the discovery document", () => {
      cy.request<DiscoveryDocument>({ url: DISCOVERY_ENDPOINT }).then(
        (discovery) => {
          expect(
            discovery.body.registration_endpoint,
            "registration_endpoint",
          ).to.equal(`${discovery.body.issuer}${REGISTRATION_ENDPOINT}`);
        },
      );
    });

    it("answers the CORS preflight so browser-based clients can register", () => {
      cy.request({
        method: "OPTIONS",
        url: REGISTRATION_ENDPOINT,
        headers: {
          Origin: "https://client.example.com",
          "Access-Control-Request-Method": "POST",
        },
      }).then((response) => {
        expect(response.status, "preflight status").to.equal(204);
        expect(
          response.headers["access-control-allow-origin"],
          "Access-Control-Allow-Origin",
        ).to.equal("*");
      });
    });

    describe("metadata validation (RFC 7591 §3.2.2)", () => {
      it("rejects a missing or plain-http redirect URI with invalid_redirect_uri", () => {
        postRegistration({ client_name: "No redirects" }).then((response) =>
          expectRegistrationError(response, "invalid_redirect_uri", "missing"),
        );
        postRegistration({
          redirect_uris: ["http://client.example.com/callback"],
        }).then((response) =>
          expectRegistrationError(response, "invalid_redirect_uri", "plain http"),
        );
        postRegistration({
          redirect_uris: [`${HTTPS_REDIRECT_URI}#fragment`],
        }).then((response) =>
          expectRegistrationError(response, "invalid_redirect_uri", "fragment"),
        );
      });

      it("rejects unsupported grant types, auth methods and jwks with invalid_client_metadata", () => {
        postRegistration({
          redirect_uris: [HTTPS_REDIRECT_URI],
          grant_types: ["implicit"],
        }).then((response) =>
          expectRegistrationError(response, "invalid_client_metadata", "implicit"),
        );
        postRegistration({
          redirect_uris: [HTTPS_REDIRECT_URI],
          token_endpoint_auth_method: "private_key_jwt",
        }).then((response) =>
          expectRegistrationError(
            response,
            "invalid_client_metadata",
            "private_key_jwt",
          ),
        );
        postRegistration({
          redirect_uris: [HTTPS_REDIRECT_URI],
          jwks_uri: "https://client.example.com/jwks.json",
        }).then((response) =>
          expectRegistrationError(response, "invalid_client_metadata", "jwks_uri"),
        );
        postRegistration({
          redirect_uris: [HTTPS_REDIRECT_URI],
          client_name: "x".repeat(129),
        }).then((response) =>
          expectRegistrationError(
            response,
            "invalid_client_metadata",
            "client_name too long",
          ),
        );
      });
    });

    it("registers a public client and echoes its metadata (no secret)", () => {
      postRegistration({
        client_name: "E2E Public MCP Client",
        redirect_uris: [REGISTERED_LOOPBACK_REDIRECT_URI, HTTPS_REDIRECT_URI],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "mcp:tools",
        client_uri: "https://client.example.com",
        contacts: ["ops@example.com"],
        software_id: "e2e-mcp-client",
        software_version: "1.0.0",
        application_type: "native",
      }).then((response) => {
        expect(response.status, "status").to.equal(201);
        expect(response.headers["cache-control"], "Cache-Control").to.include(
          "no-store",
        );
        const body = response.body;
        expect(body.client_id, "client_id").to.be.a("string").and.match(/^dcr-/);
        expect(body.client_secret, "client_secret").to.be.undefined;
        expect(body.client_id_issued_at, "client_id_issued_at").to.be.a(
          "number",
        );
        expect(body.client_name, "client_name").to.equal("E2E Public MCP Client");
        expect(body.redirect_uris, "redirect_uris").to.deep.equal([
          REGISTERED_LOOPBACK_REDIRECT_URI,
          HTTPS_REDIRECT_URI,
        ]);
        expect(body.token_endpoint_auth_method).to.equal("none");
        expect(body.grant_types).to.deep.equal([
          "authorization_code",
          "refresh_token",
        ]);
        expect(body.response_types).to.deep.equal(["code"]);
        expect(body.scope).to.equal("mcp:tools");
        expect(body.client_uri).to.equal("https://client.example.com");
        expect(body.contacts).to.deep.equal(["ops@example.com"]);
        expect(body.software_id).to.equal("e2e-mcp-client");
        expect(body.software_version).to.equal("1.0.0");
        expect(
          (body as Record<string, unknown>)["application_type"],
          "unknown members are ignored",
        ).to.be.undefined;
      });
    });

    it("registers a confidential client by default (client_secret_basic) with a one-time secret", () => {
      postRegistration({
        client_name: "E2E Confidential Client",
        redirect_uris: [HTTPS_REDIRECT_URI],
      }).then((response) => {
        expect(response.status, "status").to.equal(201);
        const body = response.body;
        expect(body.token_endpoint_auth_method).to.equal("client_secret_basic");
        expect(body.client_secret, "client_secret").to.be.a("string").and.match(
          /^svs_/,
        );
        expect(body.client_secret_expires_at, "client_secret_expires_at").to.equal(0);
        expect(body.grant_types).to.deep.equal(["authorization_code"]);

        // The secret is live: the token endpoint requires it for this
        // client and rejects a wrong one (RFC 6749 §5.2 invalid_client).
        postTokenRequest(
          {
            grant_type: "authorization_code",
            code: "not-a-real-code",
            code_verifier: "a".repeat(64),
            client_id: body.client_id,
          },
          { username: body.client_id, password: "svs_wrong-secret" },
        ).then((tokenResponse) => {
          expect(tokenResponse.status, "wrong secret status").to.equal(401);
          expect(tokenResponse.body.error, "wrong secret error").to.equal(
            "invalid_client",
          );
        });
      });
    });

    it("is rate limited per IP in its own bucket", () => {
      // The bucket allows 10 registrations per hour; the 11th is refused.
      for (let i = 0; i < 10; i++) {
        postRegistration({ redirect_uris: [HTTPS_REDIRECT_URI] }).then(
          (response) => {
            expect(response.status, `registration ${i + 1}`).to.equal(201);
          },
        );
      }
      postRegistration({ redirect_uris: [HTTPS_REDIRECT_URI] }).then(
        (response) => {
          expect(response.status, "11th registration").to.equal(429);
        },
      );
    });

    describe("a registered client completing a plain OAuth 2.1 flow", () => {
      let client: DynamicClientRegistrationResponse;

      before(() => {
        cy.reset_rate_limit();
        // Register through the client SDK helper (a plain fetch under
        // the hood; registration is anonymous so no adapter state is
        // involved).
        const auth_server_uri: string = Cypress.config("baseUrl") as string;
        cy.wrap(
          registerDynamicClient({
            adapter: {
              fetch: (input, init) => fetch(input, init),
            },
            auth_server_uri,
            metadata: {
              client_name: "E2E SDK-registered MCP Client",
              redirect_uris: [REGISTERED_LOOPBACK_REDIRECT_URI],
              token_endpoint_auth_method: "none",
              grant_types: ["authorization_code", "refresh_token"],
              response_types: ["code"],
            },
          }),
          { log: false },
        ).then((registered) => {
          client = registered as DynamicClientRegistrationResponse;
          expect(client.client_id, "sdk client_id").to.match(/^dcr-/);
          expect(client.client_secret, "sdk client_secret").to.be.undefined;
        });
      });

      it("the SDK helper surfaces registration errors as DynamicClientRegistrationFailedError", () => {
        const auth_server_uri: string = Cypress.config("baseUrl") as string;
        cy.wrap(
          registerDynamicClient({
            adapter: { fetch: (input, init) => fetch(input, init) },
            auth_server_uri,
            metadata: {
              redirect_uris: ["http://client.example.com/callback"],
            },
          }).then(
            () => "resolved" as const,
            (e: unknown) => e,
          ),
          { log: false },
        ).then((outcome) => {
          expect(outcome).to.be.instanceOf(DynamicClientRegistrationFailedError);
          const failure = outcome as DynamicClientRegistrationFailedError;
          expect(failure.status).to.equal(400);
          expect(failure.error).to.equal("invalid_redirect_uri");
          expect(failure.isRfc7591Error()).to.be.true;
        });
      });

      it("is accepted by the authorize endpoint (web redirect flows) with a registered loopback redirect on any port", () => {
        createPkcePair().then(({ challenge }) => {
          const params = new URLSearchParams({
            client_id: client.client_id,
            redirect_uri: RUNTIME_LOOPBACK_REDIRECT_URI,
            response_type: "code",
            code_challenge: challenge.code_challenge,
            code_challenge_method: "S256",
            state: `e2e-state-${Date.now()}`,
            scope: "mcp:tools",
            resource: RESOURCE_URL,
          });
          cy.request({
            method: "GET",
            url: `${AUTHORIZE_ENDPOINT}?${params.toString()}`,
            followRedirect: false,
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "authorize status").to.equal(302);
            const bridge = new URL(response.headers["location"] as string);
            expect(bridge.pathname, "bridge path").to.equal("/auth/login");
            expect(bridge.searchParams.get("app_id"), "app_id").to.equal(
              client.client_id,
            );
            expect(
              bridge.searchParams.get("redirect_uri"),
              "redirect_uri",
            ).to.equal(RUNTIME_LOOPBACK_REDIRECT_URI);
          });

          // An unregistered redirect URI is refused before any redirect.
          const bad = new URLSearchParams(params);
          bad.set("redirect_uri", "https://evil.example.com/cb");
          cy.request({
            method: "GET",
            url: `${AUTHORIZE_ENDPOINT}?${bad.toString()}`,
            followRedirect: false,
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status, "unregistered redirect status").to.equal(
              400,
            );
          });
        });
      });

      it("redeems a code for a resource-URL token the example resource server accepts", () => {
        createUserAuthorizedForClient(client.client_id).then(
          ({ email, password }) => {
            mintAuthorizationCode({
              client_id: client.client_id,
              email,
              password,
              redirect_uri: RUNTIME_LOOPBACK_REDIRECT_URI,
            }).then(({ code, code_verifier }) => {
              postTokenRequest({
                grant_type: "authorization_code",
                client_id: client.client_id,
                code,
                code_verifier,
                redirect_uri: RUNTIME_LOOPBACK_REDIRECT_URI,
                resource: RESOURCE_URL,
              }).then((codeResponse) => {
                expect(codeResponse.status, "code grant status").to.equal(200);
                expect(codeResponse.body.token_type).to.equal("Bearer");
                expect(codeResponse.body.id_token, "no id_token").to.be
                  .undefined;
                expect(codeResponse.body.scope, "no scope").to.be.undefined;
                const access_token = codeResponse.body.access_token as string;
                const refresh_token = codeResponse.body.refresh_token as string;
                expect(access_token).to.be.a("string").and.not.be.empty;
                expect(refresh_token).to.be.a("string").and.not.be.empty;

                // The token names the resource exactly as requested.
                expect(decodeTokenHeader(access_token)["aud"], "aud").to.equal(
                  RESOURCE_URL,
                );

                // ...and the resource server, which accepts that URL as an
                // audience, authenticates it against the auth server's JWKS.
                cy.request<{ uid: string; email: string | null; scheme: string }>({
                  method: "GET",
                  url: `${exampleAppOrigin}/api/whoami`,
                  headers: { Authorization: `Bearer ${access_token}` },
                }).then((whoami) => {
                  expect(whoami.status, "whoami status").to.equal(200);
                  expect(whoami.body.scheme).to.equal("schemavaults-access-token");
                  expect(whoami.body.email).to.equal(email);
                });

                // The refresh grant keeps working for the same resource.
                postTokenRequest({
                  grant_type: "refresh_token",
                  client_id: client.client_id,
                  refresh_token,
                  resource: RESOURCE_URL,
                }).then((refreshResponse) => {
                  expect(refreshResponse.status, "refresh status").to.equal(200);
                  const rotated = refreshResponse.body.access_token as string;
                  expect(decodeTokenHeader(rotated)["aud"], "refreshed aud").to.equal(
                    RESOURCE_URL,
                  );
                });
              });
            });
          },
        );
      });

      it("still gets a plain userinfo-audience token without a resource, and refuses unknown resources", () => {
        createUserAuthorizedForClient(client.client_id).then(
          ({ email, password }) => {
            mintAuthorizationCode({
              client_id: client.client_id,
              email,
              password,
              redirect_uri: RUNTIME_LOOPBACK_REDIRECT_URI,
            }).then(({ code, code_verifier }) => {
              postTokenRequest({
                grant_type: "authorization_code",
                client_id: client.client_id,
                code,
                code_verifier,
                redirect_uri: RUNTIME_LOOPBACK_REDIRECT_URI,
                resource: "https://unknown-resource.example.com/mcp",
              }).then((response) => {
                expect(response.status, "unknown resource status").to.equal(400);
                expect(response.body.error, "unknown resource error").to.equal(
                  "invalid_target",
                );
              });
            });

            mintAuthorizationCode({
              client_id: client.client_id,
              email,
              password,
              redirect_uri: RUNTIME_LOOPBACK_REDIRECT_URI,
            }).then(({ code, code_verifier }) => {
              postTokenRequest({
                grant_type: "authorization_code",
                client_id: client.client_id,
                code,
                code_verifier,
                redirect_uri: RUNTIME_LOOPBACK_REDIRECT_URI,
              }).then((response) => {
                expect(response.status, "no resource status").to.equal(200);
                expect(response.body.access_token).to.be.a("string");
              });
            });
          },
        );
      });

      it("refuses the resource by API server id too when the client is not connected and the server disallows dynamic clients", () => {
        // Flip the seeded API server's policy off for this check, then
        // restore it. Admin-only management surface (PATCH /api/apis/:id).
        cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
          if (!ok) throw new Error("Failed to login as superuser");
        });
        cy.request({
          method: "PATCH",
          url: `/api/apis/${EXAMPLE_API_SERVER_ID}`,
          body: { allow_dynamic_clients: false },
        }).then((response) => {
          expect(response.status, "disable dynamic clients").to.equal(200);
        });
        cy.logout();

        createUserAuthorizedForClient(client.client_id).then(
          ({ email, password }) => {
            mintAuthorizationCode({
              client_id: client.client_id,
              email,
              password,
              redirect_uri: RUNTIME_LOOPBACK_REDIRECT_URI,
            }).then(({ code, code_verifier }) => {
              postTokenRequest({
                grant_type: "authorization_code",
                client_id: client.client_id,
                code,
                code_verifier,
                redirect_uri: RUNTIME_LOOPBACK_REDIRECT_URI,
                resource: RESOURCE_URL,
              }).then((response) => {
                expect(response.status, "disallowed status").to.equal(400);
                expect(response.body.error, "disallowed error").to.equal(
                  "invalid_target",
                );
              });
            });
          },
        );

        cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
          if (!ok) throw new Error("Failed to login as superuser");
        });
        cy.request({
          method: "PATCH",
          url: `/api/apis/${EXAMPLE_API_SERVER_ID}`,
          body: { allow_dynamic_clients: true },
        }).then((response) => {
          expect(response.status, "re-enable dynamic clients").to.equal(200);
          expect(
            (response.body as { api_server: { allow_dynamic_clients: boolean } })
              .api_server.allow_dynamic_clients,
          ).to.equal(true);
        });
        cy.logout();
      });

      it("is visible to administrators as an ownerless client and hidden from everyone else", () => {
        cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
          if (!ok) throw new Error("Failed to login as superuser");
        });
        cy.request<{
          success: boolean;
          list: { app_id: string; owner_type?: string; public: boolean; web: boolean }[];
        }>({
          method: "GET",
          url: "/api/apps?list_apps_query_type=all",
        }).then((response) => {
          expect(response.status, "admin list status").to.equal(200);
          const row = response.body.list.find((a) => a.app_id === client.client_id);
          expect(row, "registered client listed for admins").to.not.be.undefined;
          expect(row?.owner_type, "owner_type").to.equal(
            "dynamic-client-registration",
          );
          expect(row?.public, "never publicly listed").to.equal(false);
          expect(row?.web, "web redirect flows").to.equal(true);
        });
        cy.logout();

        cy.generate_random_test_user_credentials().then((credentials) =>
          cy.create_and_login_as_regular_user(credentials).then((success) => {
            expect(success).to.be.true;
            cy.request({
              method: "GET",
              url: `/api/apps/${client.client_id}`,
              failOnStatusCode: false,
            }).then((response) => {
              expect(response.status, "non-admin app detail status").to.be.oneOf([
                403, 404,
              ]);
            });
          }),
        );
      });
    });
  });
});
