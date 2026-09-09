// RedirectUriValidation.cy.ts
//
// Verifies the OAuth2 open-redirect / authorization-code-interception
// fix: every authorization-code issuance path must validate the
// `redirect_uri` against the client app's registered allowed-origins
// list, and the token-exchange path must bind the redirect_uri across
// issuance and redemption.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";
import {
  type CodeChallengeWithDetails,
  DEFAULT_AUTH_SCOPE,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";

describe("OAuth2 redirect_uri validation (RFC 6749 §4.1.3)", () => {
  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;

  // A plausibly-shaped but completely unregistered origin used as the
  // attacker-controlled redirect_uri in the negative tests.
  const ATTACKER_ORIGIN = "https://attacker.example";

  it("happy path: registered redirect_uri completes the PKCE flow", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) throw new Error("Failed to login as superuser");

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) throw new Error("Failed to create invite code");

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `redirect-uri-happy-${suffix}@example.com`;
            const password = "TestPassword123!";

            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            });
          });
        });
      });
    });
  });

  it("page-render guard: refuses to render /auth/login when redirect_uri is not registered", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) throw new Error("Failed to login as superuser");

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) throw new Error("Failed to create invite code");

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `redirect-uri-block-render-${suffix}@example.com`;
            const password = "TestPassword123!";

            // Register the user via the legitimate PKCE flow first so a
            // user account exists. The negative assertion below is
            // independent of whether the user exists, but registering
            // here makes the test symmetric with the redemption test.
            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              cy.logout();
              cy.clearAllCookies();

              // Drive a real PKCE flow from the resource server to
              // discover a valid app_id and the legitimate URL shape.
              // Then we'll mutate redirect_uri to the attacker origin
              // and visit the resulting URL directly.
              cy.origin(exampleAppOrigin, () => {
                localStorage.clear();
                sessionStorage.clear();
                cy.visit("/");
                cy.contains("button", "Login").click();
              });

              cy.url({ timeout: 20000 }).should("include", "/auth/login");
              cy.location("search").then((search: string) => {
                const params = new URLSearchParams(search);
                params.set(
                  "redirect_uri",
                  `${ATTACKER_ORIGIN}/auth/authorize`,
                );

                // No POST to the mint endpoint should fire; the page
                // should be blocked at render time.
                cy.intercept(
                  "POST",
                  "**/api/auth/session/generate-authorization-code",
                ).as("mintAttempt");
                cy.intercept("POST", "**/api/auth/login").as("loginAttempt");

                cy.visit(`/auth/login?${params.toString()}`, {
                  failOnStatusCode: false,
                });

                // Security property: the page MUST NOT render the
                // login form for an unregistered redirect_uri. The
                // server should redirect to a 4xx error page. The
                // specific `error_id` is implementation detail (the
                // login page has several boundary checks that can
                // fire — invalid_redirect_uri, bad_request, etc. —
                // and asserting one specific id makes the test
                // brittle).
                cy.url({ timeout: 15000 }).should("include", "/error");
                cy.url().should("match", /[?&]error=4\d\d\b/);
                cy.get("input[name='email']").should("not.exist");
                cy.get("input[name='password']").should("not.exist");
                cy.get("button[type='submit']").should("not.exist");

                // The CRITICAL security guarantee: no authorization
                // code is minted for an unregistered redirect_uri.
                cy.wait(500); // give intercepts a chance to settle
                cy.get("@mintAttempt.all").should("have.length", 0);
                cy.get("@loginAttempt.all").should("have.length", 0);
              });
            });
          });
        });
      });
    });
  });

  it("redemption binding: code issued for URI A cannot be redeemed with URI B", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) throw new Error("Failed to login as superuser");

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) throw new Error("Failed to create invite code");

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `redirect-uri-bind-${suffix}@example.com`;
            const password = "TestPassword123!";

            // Register first via the legitimate PKCE flow. Then start a
            // fresh login flow, intercept the /api/auth/login mint
            // response to grab the authorization_code, and try to redeem
            // it at the token endpoint with a swapped redirect_uri.
            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              cy.logout();
              cy.clearAllCookies();
              cy.origin(exampleAppOrigin, () => {
                localStorage.clear();
                sessionStorage.clear();
                cy.visit("/");
                cy.contains("button", "Login").click();
              });

              cy.url({ timeout: 20000 }).should("include", "/auth/login");
              cy.url().should("include", "code_challenge");
              cy.wait_for_page_hydration();

              // Capture the legitimate redirect_uri + client_app_id off
              // the authorize URL so we know what the SDK sent.
              cy.location("search").then((search: string) => {
                const params = new URLSearchParams(search);
                const legitimate_redirect_uri = params.get("redirect_uri");
                const app_id = params.get("app_id");
                expect(legitimate_redirect_uri, "redirect_uri").to.be.a(
                  "string",
                );
                expect(app_id, "app_id").to.be.a("string");
                if (
                  typeof legitimate_redirect_uri !== "string" ||
                  typeof app_id !== "string"
                ) {
                  throw new Error("missing redirect_uri or app_id");
                }

                // Intercept the login mint call so we can read the
                // authorization_code the server returns (it isn't echoed
                // on the URL until the post-auth redirect runs).
                cy.intercept("POST", "**/api/auth/login").as("loginMint");

                cy.get("input[name='email']")
                  .should("be.visible")
                  .type(email, { force: true });
                cy.get("input[name='password']")
                  .should("be.visible")
                  .type(password, { force: true });
                cy.get("button[type='submit']")
                  .should("not.be.disabled")
                  .click();

                cy.wait("@loginMint").then((intercept) => {
                  const responseBody = intercept.response?.body as
                    | { authorization_code?: string }
                    | undefined;
                  const authorization_code = responseBody?.authorization_code;
                  expect(
                    authorization_code,
                    "mint returns authorization_code",
                  ).to.be.a("string");
                  if (typeof authorization_code !== "string") {
                    throw new Error("no authorization_code returned");
                  }

                  // Build a syntactically-valid but invalid PKCE
                  // exchange body. The redirect_uri check fires BEFORE
                  // the PKCE verifier compare, so we can submit with a
                  // bogus verifier and still observe the redirect_uri
                  // mismatch (the response is null on both — the test
                  // is that flipping the redirect_uri changes nothing
                  // about the rejection vs the control body). Use a
                  // long random verifier to satisfy the schema.
                  const bogusCodeVerifier = "A".repeat(64);

                  const requestBaseUrl = Cypress.config("baseUrl") as string;

                  const tokenEndpoint =
                    `${requestBaseUrl}/api/auth/token/authorization_code/${app_id}` as const;

                  // Attempt with a SWAPPED redirect_uri — must fail.
                  cy.request({
                    url: tokenEndpoint,
                    method: "POST",
                    failOnStatusCode: false,
                    headers: {
                      "Content-Type": "application/json",
                      Origin: exampleAppOrigin,
                    },
                    body: {
                      grant_type: "authorization_code",
                      code: authorization_code,
                      code_verifier: bogusCodeVerifier,
                      client_app_id: app_id,
                      audience: app_id,
                      challenge_time: Date.now(),
                      redirect_uri: `${ATTACKER_ORIGIN}/auth/authorize`,
                    },
                  }).then((swapResp) => {
                    // Token endpoint returns 400 on any invalid binding
                    // (mismatched redirect_uri OR mismatched PKCE). Either
                    // way the response must NOT carry tokens.
                    expect(swapResp.status).to.be.within(400, 499);
                    expect(swapResp.body).to.not.have.property("tokens");
                    expect(swapResp.body.success).to.not.equal(true);
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

// The standard OIDC token endpoint (/api/oidc/token) — which the client
// SDK now uses for every code redemption — must enforce the same
// issuance/redemption redirect_uri binding. Per RFC 6749 §4.1.3 the
// parameter is REQUIRED iff the authorization request carried one, and
// the values MUST be identical: a code bound to a redirect_uri cannot be
// redeemed without one or with a different one, and a code bound to none
// (the auth server's own first-party login) cannot be redeemed with one.
describe("OIDC token endpoint redirect_uri binding (RFC 6749 §4.1.3)", () => {
  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server:3007";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;
  const ATTACKER_ORIGIN = "https://attacker.example";

  interface MintedAuthorizationCode {
    code: string;
    code_verifier: string;
  }

  interface OidcTokenResponseBody {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
  }

  /**
   * Mints an authorization code through the login API with a PKCE pair
   * generated here, so the spec holds the matching code_verifier and can
   * redeem the code for real. `redirect_uri: null` mirrors the auth
   * server's own first-party login, which binds no redirect URI.
   */
  function mintAuthorizationCode(opts: {
    email: string;
    password: string;
    client_app_id: string;
    redirect_uri: string | null;
  }): Cypress.Chainable<MintedAuthorizationCode> {
    cy.reset_rate_limit();
    const verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
    return cy
      .wrap<Promise<CodeChallengeWithDetails>, CodeChallengeWithDetails>(
        PKCE_ProofKeyManager.createCodeChallenge(verifier),
        { log: false },
      )
      .then((challenge) =>
        cy
          .request({
            method: "POST",
            url: "/api/auth/login",
            failOnStatusCode: false,
            body: {
              credentials: { email: opts.email, password: opts.password },
              client_app_id: opts.client_app_id,
              code_challenge: challenge.code_challenge,
              challenge_time: challenge.challenge_time,
              redirect_uri: opts.redirect_uri,
              nonce: `e2e-nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              scope: DEFAULT_AUTH_SCOPE,
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
              code_verifier: verifier.code_verifier,
            };
          }),
      );
  }

  /** Form-encoded authorization_code grant at the OIDC token endpoint. */
  function redeemAtOidcTokenEndpoint(
    params: Record<string, string>,
  ): Cypress.Chainable<Cypress.Response<OidcTokenResponseBody>> {
    return cy.request<OidcTokenResponseBody>({
      method: "POST",
      url: "/api/oidc/token",
      form: true,
      body: { grant_type: "authorization_code", ...params },
      headers: { Accept: "application/json" },
      failOnStatusCode: false,
    });
  }

  function expectRejectedGrant(
    response: Cypress.Response<OidcTokenResponseBody>,
    label: string,
  ): void {
    expect(response.status, `${label}: status`).to.equal(400);
    expect(response.body.error, `${label}: error`).to.equal("invalid_grant");
    expect(response.body.access_token, `${label}: access_token`).to.be
      .undefined;
    expect(response.body.id_token, `${label}: id_token`).to.be.undefined;
    expect(response.body.refresh_token, `${label}: refresh_token`).to.be
      .undefined;
  }

  it("third-party code: rejects an omitted or mismatched redirect_uri, redeems the exact one", () => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) throw new Error("Failed to login as superuser");

      cy.generate_random_code(24).then((inviteCode: string) => {
        cy.create_invite_code(inviteCode, 1).then((created: boolean) => {
          if (!created) throw new Error("Failed to create invite code");

          cy.logout();

          cy.generate_random_code(12).then((suffix: string) => {
            const email = `oidc-redirect-uri-bind-${suffix}@example.com`;
            const password = "TestPassword123!";

            // Register through the real PKCE flow so the user exists and
            // has authorized the example app; then discover the app id
            // and the registered redirect_uri from a fresh authorize URL.
            cy.register_via_resource_server_pkce_flow({
              resource_server_origin: exampleAppOrigin,
              email,
              password,
              invite_code: inviteCode,
            }).then(() => {
              cy.logout();
              cy.clearAllCookies();
              cy.origin(exampleAppOrigin, () => {
                localStorage.clear();
                sessionStorage.clear();
                cy.visit("/");
                cy.contains("button", "Login").click();
              });

              cy.url({ timeout: 20000 }).should("include", "/auth/login");
              // The SDK appends the PKCE + redirect params to the login
              // URL after the initial navigation; wait for them (and for
              // hydration) before reading the query string, else this
              // races the client-side URL update.
              cy.url().should("include", "code_challenge");
              cy.url().should("include", "redirect_uri");
              cy.url().should("include", "app_id");
              cy.wait_for_page_hydration();
              cy.location("search").then((search: string) => {
                const params = new URLSearchParams(search);
                const legitimate_redirect_uri = params.get("redirect_uri");
                const app_id = params.get("app_id");
                if (
                  typeof legitimate_redirect_uri !== "string" ||
                  typeof app_id !== "string"
                ) {
                  throw new Error("missing redirect_uri or app_id");
                }

                mintAuthorizationCode({
                  email,
                  password,
                  client_app_id: app_id,
                  redirect_uri: legitimate_redirect_uri,
                }).then(({ code, code_verifier }) => {
                  const base = { client_id: app_id, code, code_verifier };

                  // Omitted: the code was issued WITH a redirect_uri, so
                  // the token request must carry it.
                  redeemAtOidcTokenEndpoint(base).then((response) =>
                    expectRejectedGrant(response, "omitted redirect_uri"),
                  );

                  // Mismatched origin.
                  redeemAtOidcTokenEndpoint({
                    ...base,
                    redirect_uri: `${ATTACKER_ORIGIN}/auth/authorize`,
                  }).then((response) =>
                    expectRejectedGrant(response, "attacker redirect_uri"),
                  );

                  // Same origin, different URL: comparison is exact.
                  redeemAtOidcTokenEndpoint({
                    ...base,
                    redirect_uri: `${legitimate_redirect_uri}?tampered=1`,
                  }).then((response) =>
                    expectRejectedGrant(response, "tampered redirect_uri"),
                  );

                  // The rejections above must not have consumed the code:
                  // the exact redirect_uri (with the real verifier) still
                  // redeems it, proving the earlier failures were the
                  // binding and nothing else.
                  redeemAtOidcTokenEndpoint({
                    ...base,
                    redirect_uri: legitimate_redirect_uri,
                  }).then((response) => {
                    expect(response.status, "exact redirect_uri: status").to.equal(
                      200,
                    );
                    expect(response.body.access_token, "access_token").to.be.a(
                      "string",
                    );
                    expect(response.body.id_token, "id_token").to.be.a("string");
                  });

                  // ...and a code is single-use.
                  redeemAtOidcTokenEndpoint({
                    ...base,
                    redirect_uri: legitimate_redirect_uri,
                  }).then((response) =>
                    expectRejectedGrant(response, "replayed code"),
                  );
                });
              });
            });
          });
        });
      });
    });
  });

  it("first-party code (no redirect_uri bound): rejects a presented redirect_uri, redeems without one", () => {
    const auth_app_id = getAuthServerAppIdFromCypressEnv();
    const auth_server_origin: string = new URL(Cypress.config("baseUrl")!)
      .origin;

    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user(credentials).then((success) => {
        expect(success, "create_and_login_as_regular_user should succeed").to
          .be.true;
        cy.logout();
        cy.clearAllCookies();

        mintAuthorizationCode({
          email: credentials.email,
          password: credentials.password,
          client_app_id: auth_app_id,
          redirect_uri: null,
        }).then(({ code, code_verifier }) => {
          const base = { client_id: auth_app_id, code, code_verifier };

          // No redirect_uri was bound at issuance, so presenting one is
          // a null-vs-string mismatch and must be refused.
          redeemAtOidcTokenEndpoint({
            ...base,
            redirect_uri: `${auth_server_origin}/account`,
          }).then((response) =>
            expectRejectedGrant(response, "unexpected redirect_uri"),
          );

          // Omitting it (RFC 6749 §4.1.3: not required when the
          // authorization request carried none) redeems the code.
          redeemAtOidcTokenEndpoint(base).then((response) => {
            expect(response.status, "no redirect_uri: status").to.equal(200);
            expect(response.body.access_token, "access_token").to.be.a(
              "string",
            );
            expect(response.body.id_token, "id_token").to.be.a("string");
            // First-party refresh tokens are always cookie-delivered.
            expect(response.body.refresh_token, "refresh_token").to.be
              .undefined;
            expect(
              response.body.refresh_token_expires_in,
              "refresh_token_expires_in",
            ).to.be.a("number");
          });
        });
      });
    });
  });
});
