// A user registering another tenant's domain on their own API server can
// neither break nor capture RFC 8707 resource-URL resolution: domains whose
// ownership is verified (migration 00057) take precedence over unverified
// registrations, and once the `require_api_server_domain_verification`
// server setting is on, unverified registrations never resolve.
//
// "neither breaks nor captures" (setting off, the default):
//   1. A squatter creates a user-owned API server, registers the example
//      resource server's domain on it with `prefix` matching and dynamic
//      clients allowed, and cannot verify it: the host is not one DNS can
//      verify, and the administrator attestation is refused to them.
//   2. A dynamically registered client still redeems a code for a token
//      whose `resource` is the example resource server's URL: it resolves to
//      the example API server alone (before verification existed, the
//      squatted registration made it ambiguous and the request failed).
//   3. Once a platform administrator attests the squatter's registration,
//      both API servers hold a verified domain matching the URL and the
//      token request is refused as `invalid_target` (ambiguous): it is the
//      verification, not the registration, that takes part in resolution.
//      Deleting the squatter's API server restores resolution.
//
// "only falls back to unverified registrations while verification is not
// required": an API server whose only (unverified) domain matches a
// resource URL keeps resolving it while the setting is off, as before
// domains could be verified, and stops once an administrator turns it on;
// the example resource server's verified domain resolves either way.
//
// The domain verification endpoint itself is covered by
// apis/ApiServerDomainVerification.cy.ts.

import {
  type CodeChallengeWithDetails,
  PKCE_ProofKeyManager,
  type DynamicClientRegistrationResponse,
} from "@schemavaults/auth-common";
import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

describe("Resource-URL resolution ignores unverified (squatted) API server domains", () => {
  const SETTING_KEY = "allow_dynamic_client_registration";
  const REQUIRE_VERIFICATION_SETTING_KEY = "require_api_server_domain_verification";
  const TOKEN_ENDPOINT = "/api/oidc/token";
  const REDIRECT_URI = "http://127.0.0.1:41234/callback";

  const exampleAppUrl: string =
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
    "http://example-nextjs-resource-server";
  const exampleAppOrigin: string = new URL(exampleAppUrl).origin;
  // Matched by prefix against the example API server's seeded domain.
  const RESOURCE_URL = `${exampleAppOrigin}/api`;

  interface OidcTokenResponseBody {
    access_token?: string;
    error?: string;
  }

  /** API servers this spec created; deleted (as the superuser) afterwards. */
  const created_api_server_ids: string[] = [];

  // crypto.randomUUID() is unavailable in the spec's browser context.
  function generateV4Uuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function loginAsSuperuser(): void {
    cy.is_authenticated().then((authenticated: boolean) => {
      if (authenticated) cy.logout();
    });
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  }

  function setBooleanSetting(key: string, enabled: boolean): void {
    loginAsSuperuser();
    cy.request({
      method: "PATCH",
      url: `/api/admin/settings/${key}`,
      body: { value: enabled },
    }).then((response) => {
      expect(response.status, `set ${key}=${enabled}`).to.equal(200);
    });
    cy.logout();
  }

  function setRegistrationEnabled(enabled: boolean): void {
    setBooleanSetting(SETTING_KEY, enabled);
  }

  function setVerificationRequired(required: boolean): void {
    setBooleanSetting(REQUIRE_VERIFICATION_SETTING_KEY, required);
  }

  function deleteCreatedApiServers(): void {
    if (created_api_server_ids.length === 0) return;
    loginAsSuperuser();
    for (const api_server_id of created_api_server_ids.splice(0)) {
      cy.request({
        method: "DELETE",
        url: `/api/apis/${api_server_id}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect([200, 404], `delete API server ${api_server_id}`).to.include(response.status);
      });
    }
    cy.logout();
  }

  /**
   * Signs a fresh user in and creates an API server owned by them with one
   * (unverified) domain, matched by prefix and open to dynamic clients.
   */
  function createUserOwnedApiServerWithDomain(
    domain: string,
  ): Cypress.Chainable<{ api_server_id: string; api_server_domain_ref_id: string }> {
    const api_server_id: string = generateV4Uuid();
    const api_server_domain_ref_id: string = generateV4Uuid();
    return cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then((created: boolean) => {
        expect(created, "API server owner creation").to.be.true;
      });
      cy.request<{ user?: { uid: string } }>({
        method: "GET",
        url: `/api/auth/whoami/${AUTH_APP_ID}`,
      }).then((whoami) => {
        const owner_uid = whoami.body.user?.uid;
        if (typeof owner_uid !== "string") throw new Error("Expected the owner's uid");
        cy.request({
          method: "POST",
          url: "/api/apis",
          body: {
            api_server_id,
            api_server_name: "Unverified Domain API",
            api_server_description: "Registers a domain without verifying it",
            created_at: Date.now(),
            public: false,
            hardcoded: false,
            owner_type: "user",
            owner_uid,
          },
        }).then((response) => {
          expect(response.status, "API server creation").to.equal(200);
          created_api_server_ids.push(api_server_id);
        });
      });
      cy.request({
        method: "POST",
        url: `/api/apis/${api_server_id}/domains`,
        body: {
          api_server_domain_ref_id,
          api_server_id,
          domain,
          environment: "test",
          created_at: Date.now(),
          hardcoded: false,
        },
      }).then((response) => {
        expect(response.status, "the domain registration itself is accepted").to.equal(200);
        expect(response.body.verification.verified, "but it is unverified").to.equal(false);
      });
      cy.request({
        method: "PATCH",
        url: `/api/apis/${api_server_id}`,
        body: { allow_dynamic_clients: true, resource_url_match_mode: "prefix" },
      }).then((response) => {
        expect(response.status, "dynamic-client policy").to.equal(200);
      });
      return cy.wrap({ api_server_id, api_server_domain_ref_id }, { log: false });
    });
  }

  function registerPublicClient(): Cypress.Chainable<DynamicClientRegistrationResponse> {
    return cy
      .request<DynamicClientRegistrationResponse>({
        method: "POST",
        url: "/api/oidc/register",
        headers: { "Content-Type": "application/json" },
        body: {
          client_name: "E2E Squatting Check Client",
          redirect_uris: [REDIRECT_URI],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        },
      })
      .then((response) => {
        expect(response.status, "registration status").to.equal(201);
        return response.body;
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

  /** Signs a fresh user in, verifies their address and authorizes the client. */
  function createUserAuthorizedForClient(
    client_id: string,
  ): Cypress.Chainable<{ email: string; password: string }> {
    return cy.generate_random_test_user_credentials().then((credentials) =>
      cy.create_and_login_as_regular_user_via_request(credentials).then((created: boolean) => {
        expect(created, "user creation").to.be.true;
        cy.verify_email_via_request(credentials.email).then((verified: boolean) => {
          expect(verified, "email verified").to.be.true;
        });
        return cy
          .request({ method: "POST", url: `/api/apps/${client_id}/authorize`, body: {} })
          .then((response) => {
            expect(response.status, "app authorization status").to.equal(200);
            return { email: credentials.email, password: credentials.password };
          });
      }),
    );
  }

  /** Mints a code and redeems it for a token whose `resource` is `resource` (RESOURCE_URL by default). */
  function requestResourceUrlToken(
    client_id: string,
    user: { email: string; password: string },
    resource: string = RESOURCE_URL,
  ): Cypress.Chainable<Cypress.Response<OidcTokenResponseBody>> {
    return createPkcePair().then(({ code_verifier, challenge }) =>
      cy
        .request({
          method: "POST",
          url: "/api/auth/login",
          body: {
            credentials: { email: user.email, password: user.password },
            client_app_id: client_id,
            code_challenge: challenge.code_challenge,
            challenge_time: challenge.challenge_time,
            redirect_uri: REDIRECT_URI,
          },
        })
        .then((login) => {
          const body = login.body as { kind?: string; authorization_code?: string };
          expect(body.kind, "login kind").to.equal("authenticated");
          return cy.request<OidcTokenResponseBody>({
            method: "POST",
            url: TOKEN_ENDPOINT,
            form: true,
            headers: { Accept: "application/json" },
            body: {
              grant_type: "authorization_code",
              client_id,
              code: body.authorization_code as string,
              code_verifier,
              redirect_uri: REDIRECT_URI,
              resource,
            },
            failOnStatusCode: false,
          });
        }),
    );
  }

  function expectTokenAcceptedByExampleResourceServer(
    response: Cypress.Response<OidcTokenResponseBody>,
    label: string,
  ): void {
    expect(response.status, `${label}: token status`).to.equal(200);
    const access_token = response.body.access_token as string;
    expect(access_token, `${label}: access token`).to.be.a("string").and.not.be.empty;
    // Encrypted with the example API server's keyset, which only happens
    // when the resource URL resolved to it.
    cy.request<{ scheme: string }>({
      method: "GET",
      url: `${exampleAppOrigin}/api/whoami`,
      headers: { Authorization: `Bearer ${access_token}` },
    }).then((whoami) => {
      expect(whoami.status, `${label}: resource server whoami`).to.equal(200);
      expect(whoami.body.scheme).to.equal("schemavaults-access-token");
    });
  }

  beforeEach(() => {
    cy.reset_rate_limit();
  });

  after(() => {
    deleteCreatedApiServers();
    setVerificationRequired(false);
    setRegistrationEnabled(false);
  });

  it("neither breaks nor captures the example resource server's resource URL", () => {
    setRegistrationEnabled(true);

    // 1. The squatter's registration of the example resource server's domain.
    createUserOwnedApiServerWithDomain(exampleAppUrl).then(({ api_server_id, api_server_domain_ref_id }) => {
      for (const body of [{ method: "dns_txt" }, { method: "administrator" }]) {
        cy.request({
          method: "POST",
          url: `/api/apis/${api_server_id}/domains/${api_server_domain_ref_id}/verify`,
          body,
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status, `squatter verification (${body.method})`).to.be.oneOf([403, 422]);
          expect(response.body.success).to.equal(false);
        });
      }
      cy.logout();

      registerPublicClient().then((client) => {
        // 2. The resource URL still resolves to the example API server alone.
        createUserAuthorizedForClient(client.client_id).then((user) => {
          requestResourceUrlToken(client.client_id, user).then((response) => {
            expectTokenAcceptedByExampleResourceServer(response, "with an unverified squat");
          });
          cy.logout();

          // 3. Verified, the squatter's registration takes part in
          //    resolution (here: making the URL ambiguous).
          loginAsSuperuser();
          cy.request({
            method: "POST",
            url: `/api/apis/${api_server_id}/domains/${api_server_domain_ref_id}/verify`,
            body: { method: "administrator" },
          }).then((response) => {
            expect(response.status, "administrator attestation").to.equal(200);
          });
          cy.logout();
          requestResourceUrlToken(client.client_id, user).then((response) => {
            expect(response.status, "with a verified second match").to.equal(400);
            expect(response.body.error).to.equal("invalid_target");
          });
          cy.logout();

          deleteCreatedApiServers();
          requestResourceUrlToken(client.client_id, user).then((response) => {
            expectTokenAcceptedByExampleResourceServer(response, "after the squat is removed");
          });
          cy.logout();
        });
      });
    });
  });

  it("only falls back to unverified registrations while verification is not required", () => {
    setRegistrationEnabled(true);
    setVerificationRequired(false);

    cy.generate_random_code(10).then((randomCode: string) => {
      const unverifiedOrigin = `https://api-${randomCode.toLowerCase()}.transition.invalid`;
      const unverifiedResource = `${unverifiedOrigin}/mcp`;
      createUserOwnedApiServerWithDomain(unverifiedOrigin);
      cy.logout();

      registerPublicClient().then((client) => {
        createUserAuthorizedForClient(client.client_id).then((user) => {
          // Not required (the default): the unverified domain is the only
          // match, so it resolves as it did before domains could be verified.
          requestResourceUrlToken(client.client_id, user, unverifiedResource).then((response) => {
            expect(response.status, "unverified sole match while not required").to.equal(200);
            expect(response.body.access_token, "access token").to.be.a("string").and.not.be.empty;
          });
          cy.logout();

          // Required: unverified registrations never resolve...
          setVerificationRequired(true);
          requestResourceUrlToken(client.client_id, user, unverifiedResource).then((response) => {
            expect(response.status, "unverified sole match once required").to.equal(400);
            expect(response.body.error).to.equal("invalid_target");
          });
          cy.logout();

          // ...while the example resource server's verified domain still does.
          requestResourceUrlToken(client.client_id, user).then((response) => {
            expectTokenAcceptedByExampleResourceServer(response, "verified domain once required");
          });
          cy.logout();

          setVerificationRequired(false);
          deleteCreatedApiServers();
        });
      });
    });
  });
});
