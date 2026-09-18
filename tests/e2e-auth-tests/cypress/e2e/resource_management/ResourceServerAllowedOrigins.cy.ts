// Covers GET /api/resource-server/apis/[api_server_id]/allowed-origins, the
// bearer-authenticated endpoint that @schemavaults/auth-server-sdk's
// RemoteAllowedOriginsResolver uses to learn which browser origins may call a
// resource server. It had no E2E coverage. Authentication is a single-use
// JWKS access assertion (RS256, signed with the API server's JWKS access
// private key), exactly like GET /api/jwks/[audience].

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface AllowedOriginsResponseBody {
  success: boolean;
  error?: string;
  data?: { api_server_id: string; environment: string; origins: string[] };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Mints a fresh single-use JWKS access assertion for `api_server_id`. */
function mintAssertion(
  api_server_id: string,
  private_key_pem: string,
): Cypress.Chainable<string> {
  return cy
    .task("createJwksAccessProofToken", { api_server_id, private_key_pem })
    .then((token) => {
      if (typeof token !== "string") {
        throw new TypeError("Expected createJwksAccessProofToken to yield a string");
      }
      return token;
    });
}

function getAllowedOrigins(
  api_server_id: string,
  headers: Record<string, string>,
): Cypress.Chainable<Cypress.Response<AllowedOriginsResponseBody>> {
  return cy.request<AllowedOriginsResponseBody>({
    method: "GET",
    url: `/api/resource-server/apis/${api_server_id}/allowed-origins`,
    headers,
    failOnStatusCode: false,
  });
}

interface ResourceServerFixture {
  api_server_id: string;
  private_key: string;
  domains: string[];
}

/**
 * As the superuser: creates an API server with a JWKS access key, a client
 * app with three registered domains, and connects the app to the API server.
 */
function setupResourceServer(): Cypress.Chainable<ResourceServerFixture> {
  const api_server_id = randomId("e2e-ao-api");
  const app_id = randomId("e2e-ao-app");
  const domains = [
    "https://allowed-origins-a.example",
    "allowed-origins-b.example:3000",
    "http://localhost:4000",
  ];
  const environment: string =
    Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test";

  return cy
    .create_and_login_as_superuser_via_request()
    .then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
      cy.request({
        method: "POST",
        url: "/api/apis",
        body: {
          api_server_id,
          api_server_name: `Allowed origins ${api_server_id}`,
          api_server_description: "ResourceServerAllowedOrigins.cy.ts",
          created_at: Date.now(),
          public: false,
          hardcoded: false,
        },
      }).then((response) => expect(response.status).to.eq(200));
      cy.request({
        method: "POST",
        url: "/api/apps",
        body: {
          app_id,
          app_name: `Allowed origins ${app_id}`,
          app_description: "ResourceServerAllowedOrigins.cy.ts",
          created_at: Date.now(),
          public: false,
          hardcoded: false,
          web: true,
        },
      }).then((response) => expect(response.status).to.eq(200));
      for (const domain of domains) {
        cy.request({
          method: "POST",
          url: `/api/apps/${app_id}/domains`,
          body: {
            app_domain_ref_id: generateV4Uuid(),
            app_id,
            domain,
            environment,
            created_at: Date.now(),
            hardcoded: false,
          },
        }).then((response) => expect(response.status).to.eq(200));
      }
      cy.request({
        method: "POST",
        url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
      }).then((response) => expect(response.status).to.eq(200));
      return cy.generate_jwks_access_key(api_server_id);
    })
    .then(({ success, private_key }) => {
      if (!success || !private_key) {
        throw new Error("Failed to generate JWKS access key");
      }
      cy.logout();
      return cy.wrap<ResourceServerFixture>(
        { api_server_id, private_key, domains },
        { log: false },
      );
    });
}

describe("GET /api/resource-server/apis/:api_server_id/allowed-origins", () => {
  it("returns the sorted domains of every app connected to the API server", () => {
    setupResourceServer().then(({ api_server_id, private_key, domains }) => {
      mintAssertion(api_server_id, private_key).then((token) => {
        getAllowedOrigins(api_server_id, {
          Authorization: `Bearer ${token}`,
        }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.data?.api_server_id).to.eq(api_server_id);
          expect(response.body.data?.environment).to.eq(
            Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test",
          );
          expect(response.body.data?.origins).to.deep.equal(
            [...domains].sort(),
          );
          expect(response.headers["cache-control"]).to.eq("no-store");
        });
      });
    });
  });

  it("returns an empty list for an API server with no connected apps", () => {
    const api_server_id = randomId("e2e-ao-empty");
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
      cy.request({
        method: "POST",
        url: "/api/apis",
        body: {
          api_server_id,
          api_server_name: `Allowed origins ${api_server_id}`,
          api_server_description: "ResourceServerAllowedOrigins.cy.ts",
          created_at: Date.now(),
          public: false,
          hardcoded: false,
        },
      }).then((response) => expect(response.status).to.eq(200));
      cy.generate_jwks_access_key(api_server_id).then(({ private_key }) => {
        if (!private_key) throw new Error("Failed to generate JWKS access key");
        cy.logout();
        mintAssertion(api_server_id, private_key).then((token) => {
          getAllowedOrigins(api_server_id, {
            Authorization: `Bearer ${token}`,
          }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.data?.origins).to.deep.equal([]);
          });
        });
      });
    });
  });

  it("rejects requests without a valid single-use assertion for that API server", () => {
    setupResourceServer().then(({ api_server_id, private_key }) => {
      getAllowedOrigins(api_server_id, {}).then((response) => {
        expect(response.status, "no Authorization header").to.eq(401);
        expect(response.body.success).to.eq(false);
      });
      getAllowedOrigins(api_server_id, { Authorization: "Basic abc" }).then(
        (response) => {
          expect(response.status, "non-Bearer scheme").to.eq(401);
        },
      );
      getAllowedOrigins(api_server_id, {
        Authorization: "Bearer not-a-jwt",
      }).then((response) => {
        expect(response.status, "garbage assertion").to.eq(401);
      });

      // An assertion minted for a different API server is refused, even
      // though it is validly signed by a real key.
      const other_api_server_id = randomId("e2e-ao-other");
      cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
        if (!ok) throw new Error("Failed to login as superuser");
        cy.request({
          method: "POST",
          url: "/api/apis",
          body: {
            api_server_id: other_api_server_id,
            api_server_name: `Other ${other_api_server_id}`,
            api_server_description: "ResourceServerAllowedOrigins.cy.ts",
            created_at: Date.now(),
            public: false,
            hardcoded: false,
          },
        }).then((response) => expect(response.status).to.eq(200));
        cy.logout();
      });
      mintAssertion(api_server_id, private_key).then((token) => {
        getAllowedOrigins(other_api_server_id, {
          Authorization: `Bearer ${token}`,
        }).then((response) => {
          expect(response.status, "assertion for another audience").to.eq(401);
        });
      });

      // Replay: the same assertion cannot be presented twice.
      mintAssertion(api_server_id, private_key).then((token) => {
        getAllowedOrigins(api_server_id, {
          Authorization: `Bearer ${token}`,
        }).then((first) => {
          expect(first.status, "first use").to.eq(200);
          getAllowedOrigins(api_server_id, {
            Authorization: `Bearer ${token}`,
          }).then((second) => {
            expect(second.status, "replayed assertion").to.eq(401);
          });
        });
      });
    });
  });

  it("returns 400 for a malformed id and for the auth server's own API id", () => {
    getAllowedOrigins("bad%20id", {}).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.body.success).to.eq(false);
    });
    getAllowedOrigins(AUTH_APP_ID, {}).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.body.success).to.eq(false);
    });
  });
});
