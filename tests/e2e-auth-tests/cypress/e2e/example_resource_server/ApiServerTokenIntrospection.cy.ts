// ApiServerTokenIntrospection.cy.ts
//
// API servers introspecting the access tokens minted for them at
// POST /api/oidc/introspect (RFC 7662), authenticating with
// `private_key_jwt` (RFC 7523 §2.2): the client assertion is a JWKS access
// proof token signed with the API server's JWKS access key.
//
// Setup (superuser): two fresh API servers A and B, each with a JWKS access
// key, and the seeded confidential client app connected to A only. Access
// tokens come from the client_credentials grant with `resource=<api server>`
// (no browser flow), so every case is a direct cy.request.
//
// The confidential client app is seeded in cypress.config.ts's before:run
// hook for this suite, already connected to the example resource server's
// API server.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

interface TokenResponseBody {
  access_token?: string;
  error?: string;
}

interface IntrospectionResponseBody {
  active?: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  uid?: string;
  aud?: string;
  iss?: string;
  jti?: string;
  error?: string;
  error_description?: string;
}

interface TestApiServer {
  api_server_id: string;
  private_key_pem: string;
}

describe("Token introspection by API servers (private_key_jwt)", () => {
  const TOKEN_ENDPOINT = "/api/oidc/token";
  const INTROSPECTION_ENDPOINT = "/api/oidc/introspect";
  const JWT_BEARER_CLIENT_ASSERTION_TYPE =
    "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
  const EXPECTED_WWW_AUTHENTICATE =
    'Basic realm="oauth2/token", charset="UTF-8"';
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

  const confidentialClientId: string = Cypress.env(
    "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID",
  );
  const confidentialClientSecret: string = Cypress.env(
    "OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET",
  );
  // The example resource server's API server id.
  const exampleApiServerId = "00000000-0000-0000-0000-000000000000";

  /** The service account's synthetic email (see app-service-accounts.ts). */
  const expectedServiceAccountEmail = `${confidentialClientId}@service-accounts.invalid`;

  // Filled in by before().
  let apiServerA: TestApiServer;
  let apiServerB: TestApiServer;

  function basicHeader(client_id: string, client_secret: string): string {
    const encoded: string = btoa(
      `${encodeURIComponent(client_id)}:${encodeURIComponent(client_secret)}`,
    );
    return `Basic ${encoded}`;
  }

  /** An M2M access token for `resource` (default audience when omitted). */
  function mintAccessToken(form: Record<string, string> = {}): Cypress.Chainable<string> {
    return cy
      .request<TokenResponseBody>({
        method: "POST",
        url: TOKEN_ENDPOINT,
        form: true,
        headers: {
          Authorization: basicHeader(confidentialClientId, confidentialClientSecret),
        },
        body: { grant_type: "client_credentials", ...form },
      })
      .then((response) => {
        expect(response.status, "token endpoint status").to.equal(200);
        expect(response.body.access_token, "access_token").to.be.a("string").and
          .not.be.empty;
        return response.body.access_token as string;
      });
  }

  function createApiServerWithJwksAccessKey(label: string): Cypress.Chainable<TestApiServer> {
    return cy.generate_random_code(8).then((code: string) => {
      return cy
        .create_api_server({
          api_server_name: `Introspection ${label} ${code}`,
          api_server_description: `E2E API server introspection (${label}) ${code}`,
        })
        .then(({ success, api_server_id }) => {
          if (!success || !api_server_id) {
            throw new Error(`Failed to create API server ${label}`);
          }
          return cy
            .generate_jwks_access_key(api_server_id)
            .then(({ success: keyCreated, private_key }) => {
              if (!keyCreated || !private_key) {
                throw new Error(`Failed to generate a JWKS access key for API server ${label}`);
              }
              return { api_server_id, private_key_pem: private_key };
            });
        });
    });
  }

  function mintAssertion(api_server: TestApiServer): Cypress.Chainable<string> {
    return cy
      .task("createJwksAccessProofToken", {
        api_server_id: api_server.api_server_id,
        private_key_pem: api_server.private_key_pem,
      })
      .then((assertion) => {
        if (typeof assertion !== "string") {
          throw new TypeError("Expected createJwksAccessProofToken to return a string");
        }
        return assertion;
      });
  }

  function postIntrospection(
    body: Record<string, string>,
    headers: Record<string, string> = {},
  ): Cypress.Chainable<Cypress.Response<IntrospectionResponseBody>> {
    return cy.request<IntrospectionResponseBody>({
      method: "POST",
      url: INTROSPECTION_ENDPOINT,
      form: true,
      failOnStatusCode: false,
      headers,
      body,
    });
  }

  /** Introspect `token` as `api_server`, with a fresh assertion. */
  function introspectAs(
    api_server: TestApiServer,
    token: string,
  ): Cypress.Chainable<Cypress.Response<IntrospectionResponseBody>> {
    return mintAssertion(api_server).then((client_assertion) =>
      postIntrospection({
        token,
        client_id: api_server.api_server_id,
        client_assertion_type: JWT_BEARER_CLIENT_ASSERTION_TYPE,
        client_assertion,
      }),
    );
  }

  function expectInactive(
    response: Cypress.Response<IntrospectionResponseBody>,
    label: string,
  ): void {
    expect(response.status, `${label}: status`).to.equal(200);
    // §2.2: nothing but `active: false`, whatever the reason.
    expect(response.body, `${label}: body`).to.deep.equal({ active: false });
  }

  function expectInvalidClient(
    response: Cypress.Response<IntrospectionResponseBody>,
    expectedDescription: string,
  ): void {
    expect(response.status, "status").to.equal(401);
    expect(response.body.error, "error").to.equal("invalid_client");
    expect(response.body.error_description, "error_description").to.equal(
      expectedDescription,
    );
    expect(response.headers["www-authenticate"], "WWW-Authenticate").to.equal(
      EXPECTED_WWW_AUTHENTICATE,
    );
  }

  before(() => {
    cy.create_and_login_as_superuser().then((success) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }
      createApiServerWithJwksAccessKey("A").then((server) => {
        apiServerA = server;
      });
      createApiServerWithJwksAccessKey("B").then((server) => {
        apiServerB = server;
      });
      cy.then(() => {
        cy.request({
          method: "POST",
          url: `/api/apis/${apiServerA.api_server_id}/connect_app/${confidentialClientId}`,
        }).then((response) => {
          expect(response.status, "connect app to API server A").to.equal(200);
        });
      });
    });
  });

  it("reports an access token minted for the API server as active, with its metadata", () => {
    mintAccessToken({ resource: apiServerA.api_server_id, scope: "email" }).then(
      (token: string) => {
        introspectAs(apiServerA, token).then((response) => {
          expect(response.status, "status").to.equal(200);
          expect(response.headers["cache-control"], "Cache-Control").to.contain(
            "no-store",
          );
          const body = response.body;
          expect(body.active, "active").to.equal(true);
          expect(body.client_id, "client_id").to.equal(confidentialClientId);
          expect(body.aud, "aud").to.equal(apiServerA.api_server_id);
          expect(body.iss, "iss").to.equal(Cypress.env("AUTH_SERVER_URL"));
          expect(body.token_type, "token_type").to.equal("Bearer");
          expect(body.scope, "scope").to.equal("email");
          expect(body.username, "username").to.equal(expectedServiceAccountEmail);
          expect(body.uid, "uid").to.match(UUID_REGEX);
          // `sub` is the OIDC subject; `uid` the platform user id inside it.
          expect(body.sub, "sub").to.equal(`${AUTH_APP_ID}|${body.uid}`);
          expect(body.exp, "exp").to.be.a("number").and.be.greaterThan(
            body.iat as number,
          );
          expect(body.jti, "jti").to.be.a("string").and.not.be.empty;
        });
      },
    );
  });

  it("never reveals a token minted for another audience", () => {
    // A token for A, introspected by B.
    mintAccessToken({ resource: apiServerA.api_server_id }).then((token: string) => {
      introspectAs(apiServerB, token).then((response) =>
        expectInactive(response, "A's token as B"),
      );
    });
    // A token for the example resource server's API server, introspected by A.
    mintAccessToken({ resource: exampleApiServerId }).then((token: string) => {
      introspectAs(apiServerA, token).then((response) =>
        expectInactive(response, "example API server's token as A"),
      );
    });
    // A default-audience (`oidc-userinfo`) token belongs to the client app.
    mintAccessToken().then((token: string) => {
      introspectAs(apiServerA, token).then((response) =>
        expectInactive(response, "userinfo-audience token as A"),
      );
    });
    introspectAs(apiServerA, "not-a-token").then((response) =>
      expectInactive(response, "garbage token"),
    );
  });

  it("refuses an assertion that does not verify against the API server's active JWKS access key", () => {
    // Signed with B's key, but claiming to be A.
    cy.task("signCustomJwksAccessAssertion", {
      private_key_pem: apiServerB.private_key_pem,
      claims: (() => {
        const now = Math.floor(Date.now() / 1000);
        return {
          api_server_id: apiServerA.api_server_id,
          sub: apiServerA.api_server_id,
          iss: apiServerA.api_server_id,
          aud: Cypress.env("AUTH_SERVER_URL"),
          iat: now,
          nbf: now - 1,
          exp: now + 60,
          jti: `e2e-jti-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
      })(),
    }).then((client_assertion) => {
      postIntrospection({
        token: "probe",
        client_assertion_type: JWT_BEARER_CLIENT_ASSERTION_TYPE,
        client_assertion: String(client_assertion),
      }).then((response) =>
        expectInvalidClient(response, "Invalid client assertion."),
      );
    });

    postIntrospection({
      token: "probe",
      client_assertion_type: JWT_BEARER_CLIENT_ASSERTION_TYPE,
      client_assertion: "not-a-jwt",
    }).then((response) =>
      expectInvalidClient(
        response,
        "The client assertion must be a JWT whose 'iss' is the API server id.",
      ),
    );
  });

  it("refuses a replayed assertion: each one is single-use", () => {
    mintAssertion(apiServerA).then((client_assertion) => {
      const body = {
        token: "probe",
        client_assertion_type: JWT_BEARER_CLIENT_ASSERTION_TYPE,
        client_assertion,
      };
      postIntrospection(body).then((first) => {
        expectInactive(first, "first use");
      });
      postIntrospection(body).then((replay) =>
        expectInvalidClient(replay, "Invalid client assertion."),
      );
    });
  });

  it("refuses a client_id that does not match the assertion's issuer", () => {
    mintAssertion(apiServerA).then((client_assertion) => {
      postIntrospection({
        token: "probe",
        client_id: apiServerB.api_server_id,
        client_assertion_type: JWT_BEARER_CLIENT_ASSERTION_TYPE,
        client_assertion,
      }).then((response) =>
        expectInvalidClient(
          response,
          "The client assertion's issuer does not match the request's client_id.",
        ),
      );
    });
  });

  it("rejects malformed assertion parameters with invalid_request", () => {
    mintAssertion(apiServerA).then((client_assertion) => {
      postIntrospection({
        token: "probe",
        client_assertion_type: "urn:example:unsupported",
        client_assertion,
      }).then((response) => {
        expect(response.status, "unsupported type: status").to.equal(400);
        expect(response.body.error, "unsupported type: error").to.equal(
          "invalid_request",
        );
      });
    });
    postIntrospection({
      token: "probe",
      client_assertion_type: JWT_BEARER_CLIENT_ASSERTION_TYPE,
    }).then((response) => {
      expect(response.status, "missing assertion: status").to.equal(400);
      expect(response.body.error_description, "missing assertion").to.equal(
        "Missing 'client_assertion' parameter.",
      );
    });
    // RFC 6749 §2.3: one client authentication method per request.
    mintAssertion(apiServerA).then((client_assertion) => {
      postIntrospection(
        {
          token: "probe",
          client_assertion_type: JWT_BEARER_CLIENT_ASSERTION_TYPE,
          client_assertion,
        },
        {
          Authorization: basicHeader(confidentialClientId, confidentialClientSecret),
        },
      ).then((response) => {
        expect(response.status, "two methods: status").to.equal(400);
        expect(response.body.error, "two methods: error").to.equal(
          "invalid_request",
        );
      });
    });
  });

  it("does not let the client app introspect a token minted for an API server", () => {
    mintAccessToken({ resource: apiServerA.api_server_id }).then((token: string) => {
      cy.request<IntrospectionResponseBody>({
        method: "POST",
        url: INTROSPECTION_ENDPOINT,
        form: true,
        headers: {
          Authorization: basicHeader(confidentialClientId, confidentialClientSecret),
        },
        body: { token },
      }).then((response) => expectInactive(response, "API token as the client app"));
    });
  });

  // Runs last: it disconnects the client app from API server A.
  it("reports a token inactive once its client app is disconnected from the API server", () => {
    mintAccessToken({ resource: apiServerA.api_server_id }).then((token: string) => {
      introspectAs(apiServerA, token).then((before) => {
        expect(before.body.active, "active while connected").to.equal(true);
      });

      cy.create_and_login_as_superuser().then((success) => {
        if (!success) {
          throw new Error("Failed to log in as superuser");
        }
        cy.request({
          method: "DELETE",
          url: `/api/apis/${apiServerA.api_server_id}/connect_app/${confidentialClientId}`,
        }).then((response) => {
          expect(response.status, "disconnect").to.equal(200);
        });
      });

      introspectAs(apiServerA, token).then((after) =>
        expectInactive(after, "after disconnecting the app"),
      );
    });
  });
});
