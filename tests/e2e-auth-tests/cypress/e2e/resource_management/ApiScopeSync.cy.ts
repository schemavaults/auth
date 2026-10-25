// Scope sync: PUT /api/resource-server/apis/[api_server_id]/scopes lets a
// resource server define its API scopes from code, authenticated with its
// JWKS access key (a single-use assertion, like the other resource-server
// endpoints). The sync is declarative and additive: it creates missing
// scopes, updates changed descriptions / allow_dynamic_clients, and never
// deletes (scopes it does not list come back as `not_in_manifest`).
// GET /json-schema/api-server-scopes.json serves the manifest's JSON Schema.
//
// Each test creates its own API server with a JWKS access key (the example
// resource server's private key never reaches the test runner), so no
// cleanup of shared scopes is needed.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();
const JSON_SCHEMA_PATH = "/json-schema/api-server-scopes.json";

interface ManifestEntry {
  scope: string;
  description: string;
  allow_dynamic_clients?: boolean;
}

interface SyncedScope {
  scope: string;
  description: string;
  allow_dynamic_clients: boolean;
  previous?: { description?: string; allow_dynamic_clients?: boolean };
}

interface SyncResponseBody {
  success: boolean;
  error?: string;
  message?: string;
  data?: {
    api_server_id: string;
    dry_run: boolean;
    created: SyncedScope[];
    updated: SyncedScope[];
    unchanged: string[];
    not_in_manifest: { scope: string; description: string }[];
  };
}

interface StoredScope {
  api_server_scope_id: string;
  scope: string;
  description: string;
  allow_dynamic_clients: boolean;
  created_by: string | null;
}

interface TestApiServer {
  api_server_id: string;
  private_key_pem: string;
}

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

/** As the signed-in superuser: a fresh API server with a JWKS access key. */
function createApiServerWithJwksAccessKey(): Cypress.Chainable<TestApiServer> {
  const api_server_id = randomId("e2e-sync");
  cy.request({
    method: "POST",
    url: "/api/apis",
    body: {
      api_server_id,
      api_server_name: `Scope sync ${api_server_id}`,
      api_server_description: "ApiScopeSync.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
    },
  }).then((response) => expect(response.status, "create API server").to.eq(200));
  return cy
    .generate_jwks_access_key(api_server_id)
    .then(({ success, private_key }) => {
      if (!success || !private_key) {
        throw new Error("Failed to generate JWKS access key");
      }
      return cy.wrap<TestApiServer>({ api_server_id, private_key_pem: private_key }, { log: false });
    });
}

function mintAssertion(api_server: TestApiServer): Cypress.Chainable<string> {
  return cy
    .task("createJwksAccessProofToken", {
      api_server_id: api_server.api_server_id,
      private_key_pem: api_server.private_key_pem,
    })
    .then((token) => {
      if (typeof token !== "string") {
        throw new TypeError("Expected createJwksAccessProofToken to yield a string");
      }
      return token;
    });
}

function putScopes(
  api_server_id: string,
  body: unknown,
  { authorization, dry_run }: { authorization?: string; dry_run?: boolean } = {},
): Cypress.Chainable<Cypress.Response<SyncResponseBody>> {
  return cy.request<SyncResponseBody>({
    method: "PUT",
    url: `/api/resource-server/apis/${api_server_id}/scopes${dry_run ? "?dry_run=true" : ""}`,
    headers: authorization ? { Authorization: authorization } : {},
    body: body as Cypress.RequestBody,
    failOnStatusCode: false,
  });
}

/** Syncs `scopes` with a fresh assertion and expects a 200. */
function sync(
  api_server: TestApiServer,
  scopes: ManifestEntry[],
  dry_run = false,
): Cypress.Chainable<NonNullable<SyncResponseBody["data"]>> {
  return mintAssertion(api_server).then((token) =>
    putScopes(api_server.api_server_id, { scopes }, { authorization: `Bearer ${token}`, dry_run }).then(
      (response) => {
        expect(response.status, `sync status (${JSON.stringify(response.body)})`).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.headers["cache-control"]).to.eq("no-store");
        const data = response.body.data;
        if (!data) throw new Error("Missing sync result");
        expect(data.api_server_id).to.eq(api_server.api_server_id);
        expect(data.dry_run).to.eq(dry_run);
        return data;
      },
    ),
  );
}

/** The API server's scopes through the console API (as the signed-in superuser). */
function listScopes(api_server_id: string): Cypress.Chainable<StoredScope[]> {
  return cy
    .request<{ success: boolean; list: StoredScope[] }>({
      method: "GET",
      url: `/api/apis/${api_server_id}/scopes`,
    })
    .then((response) => {
      expect(response.status, "list scopes").to.eq(200);
      return response.body.list;
    });
}

/**
 * GET /json-schema/api-server-scopes.json, body parsed whether or not
 * Cypress treats `application/schema+json` as JSON.
 */
function getJsonSchema(): Cypress.Chainable<{
  response: Cypress.Response<unknown>;
  schema: Record<string, unknown>;
}> {
  return cy.request<unknown>(JSON_SCHEMA_PATH).then((response) => {
    const schema: unknown = typeof response.body === "string" ? JSON.parse(response.body) : response.body;
    if (typeof schema !== "object" || schema === null) {
      throw new TypeError("Expected the JSON Schema document to be an object");
    }
    return { response, schema: schema as Record<string, unknown> };
  });
}

const NOTES_READ: ManifestEntry = { scope: "notes:read", description: "Read your notes." };
const NOTES_WRITE: ManifestEntry = {
  scope: "notes:write",
  description: "Create, edit and delete your notes.",
  allow_dynamic_clients: false,
};

describe("PUT /api/resource-server/apis/:api_server_id/scopes (scope sync)", () => {
  // The superuser stays signed in: it sets up API servers and console-defined
  // scopes, and its session cookie must not count as a sync credential.
  beforeEach(() => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      if (!ok) throw new Error("Failed to login as superuser");
    });
  });

  it("writes nothing on a dry run, creates on a sync and reports a second run unchanged", () => {
    createApiServerWithJwksAccessKey().then((api_server) => {
      sync(api_server, [NOTES_READ, NOTES_WRITE], true).then((data) => {
        expect(data.created).to.deep.eq([
          { ...NOTES_READ, allow_dynamic_clients: true },
          NOTES_WRITE,
        ]);
        expect(data.updated).to.deep.eq([]);
        expect(data.unchanged).to.deep.eq([]);
        expect(data.not_in_manifest).to.deep.eq([]);
      });
      listScopes(api_server.api_server_id).then((scopes) => {
        expect(scopes, "nothing written by the dry run").to.deep.eq([]);
      });

      sync(api_server, [NOTES_READ, NOTES_WRITE]).then((data) => {
        expect(data.created.map((scope) => scope.scope)).to.deep.eq(["notes:read", "notes:write"]);
      });
      listScopes(api_server.api_server_id).then((scopes) => {
        // Listed oldest first, in manifest order; synced scopes have no creator.
        expect(scopes.map(({ scope, description, allow_dynamic_clients, created_by }) => ({
          scope,
          description,
          allow_dynamic_clients,
          created_by,
        }))).to.deep.eq([
          { ...NOTES_READ, allow_dynamic_clients: true, created_by: null },
          { ...NOTES_WRITE, created_by: null },
        ]);
      });

      sync(api_server, [NOTES_READ, NOTES_WRITE]).then((data) => {
        expect(data.created).to.deep.eq([]);
        expect(data.updated).to.deep.eq([]);
        expect(data.unchanged).to.deep.eq(["notes:read", "notes:write"]);
      });
    });
  });

  it("updates a changed description, and allow_dynamic_clients only when the entry gives it", () => {
    createApiServerWithJwksAccessKey().then((api_server) => {
      sync(api_server, [NOTES_READ]);
      listScopes(api_server.api_server_id).then(([scope]) => {
        if (!scope) throw new Error("Expected the synced scope");
        // A person closes the scope to dynamic clients in the console.
        cy.request({
          method: "PATCH",
          url: `/api/apis/${api_server.api_server_id}/scopes/${scope.api_server_scope_id}`,
          body: { allow_dynamic_clients: false },
        }).then((response) => expect(response.status, "console update").to.eq(200));
      });

      // The entry leaves allow_dynamic_clients out: the console's choice stands.
      sync(api_server, [{ scope: "notes:read", description: "Read all of your notes." }]).then((data) => {
        expect(data.updated).to.deep.eq([
          {
            scope: "notes:read",
            description: "Read all of your notes.",
            allow_dynamic_clients: false,
            previous: { description: "Read your notes." },
          },
        ]);
      });

      // The entry gives it: the manifest wins, on later syncs too.
      sync(api_server, [
        { scope: "notes:read", description: "Read all of your notes.", allow_dynamic_clients: true },
      ]).then((data) => {
        expect(data.updated).to.deep.eq([
          {
            scope: "notes:read",
            description: "Read all of your notes.",
            allow_dynamic_clients: true,
            previous: { allow_dynamic_clients: false },
          },
        ]);
      });
      listScopes(api_server.api_server_id).then(([scope]) => {
        expect(scope?.description).to.eq("Read all of your notes.");
        expect(scope?.allow_dynamic_clients).to.eq(true);
      });
    });
  });

  it("reports a console-defined scope as not_in_manifest and never deletes it", () => {
    createApiServerWithJwksAccessKey().then((api_server) => {
      cy.request({
        method: "POST",
        url: `/api/apis/${api_server.api_server_id}/scopes`,
        body: { scope: "legacy:read", description: "Legacy read access." },
      }).then((response) => expect(response.status, "console create").to.eq(200));

      sync(api_server, [NOTES_READ]).then((data) => {
        expect(data.created.map((scope) => scope.scope)).to.deep.eq(["notes:read"]);
        expect(data.not_in_manifest).to.deep.eq([
          { scope: "legacy:read", description: "Legacy read access." },
        ]);
      });
      sync(api_server, []).then((data) => {
        expect(data.not_in_manifest.map((scope) => scope.scope)).to.deep.eq(["legacy:read", "notes:read"]);
      });
      listScopes(api_server.api_server_id).then((scopes) => {
        expect(scopes.map((scope) => scope.scope)).to.deep.eq(["legacy:read", "notes:read"]);
      });
    });
  });

  it("syncs a manifest naming the served JSON Schema in $schema as it is", () => {
    createApiServerWithJwksAccessKey().then((api_server) => {
      getJsonSchema().then(({ schema }) => {
        mintAssertion(api_server).then((token) => {
          putScopes(
            api_server.api_server_id,
            { $schema: schema.$id, scopes: [NOTES_READ] },
            { authorization: `Bearer ${token}` },
          ).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body.data?.created.map((scope) => scope.scope)).to.deep.eq(["notes:read"]);
          });
        });
      });
    });
  });

  it("refuses a missing, replayed or other API server's assertion", () => {
    createApiServerWithJwksAccessKey().then((api_server) => {
      createApiServerWithJwksAccessKey().then((other_api_server) => {
        const body = { scopes: [NOTES_READ] };

        // The superuser's session cookie is not a credential here.
        putScopes(api_server.api_server_id, body).then((response) => {
          expect(response.status, "no Authorization header").to.eq(401);
          expect(response.body.success).to.eq(false);
        });
        putScopes(api_server.api_server_id, body, { authorization: "Bearer not-a-jwt" }).then((response) => {
          expect(response.status, "garbage assertion").to.eq(401);
        });
        mintAssertion(other_api_server).then((token) => {
          putScopes(api_server.api_server_id, body, { authorization: `Bearer ${token}` }).then((response) => {
            expect(response.status, "assertion for another API server").to.eq(401);
          });
        });
        mintAssertion(api_server).then((token) => {
          putScopes(api_server.api_server_id, body, { authorization: `Bearer ${token}`, dry_run: true }).then(
            (first) => {
              expect(first.status, "first use").to.eq(200);
              putScopes(api_server.api_server_id, body, { authorization: `Bearer ${token}` }).then((second) => {
                expect(second.status, "replayed assertion").to.eq(401);
              });
            },
          );
        });
        listScopes(api_server.api_server_id).then((scopes) => {
          expect(scopes, "nothing written by refused requests").to.deep.eq([]);
        });
        listScopes(other_api_server.api_server_id).then((scopes) => {
          expect(scopes, "the other API server is untouched").to.deep.eq([]);
        });
      });
    });

    putScopes("bad%20id", { scopes: [] }).then((response) => {
      expect(response.status, "malformed API server id").to.eq(400);
    });
    putScopes(AUTH_APP_ID, { scopes: [] }).then((response) => {
      expect(response.status, "the auth server's own id").to.eq(400);
    });
  });

  it("refuses an invalid list with 400 and changes nothing", () => {
    createApiServerWithJwksAccessKey().then((api_server) => {
      sync(api_server, [NOTES_READ]);
      const invalidLists: unknown[] = [
        { scopes: [NOTES_WRITE, { ...NOTES_WRITE, description: "Again." }] },
        { scopes: [NOTES_WRITE, { scope: "openid", description: "Reserved." }] },
        { scopes: [NOTES_WRITE, { scope: "notes share", description: "A space." }] },
        { scopes: [NOTES_WRITE, { scope: "notes:share" }] },
        { scopes: [NOTES_WRITE], prune: true },
      ];
      for (const body of invalidLists) {
        mintAssertion(api_server).then((token) => {
          putScopes(api_server.api_server_id, body, { authorization: `Bearer ${token}` }).then((response) => {
            expect(response.status, JSON.stringify(body)).to.eq(400);
            expect(response.body.error).to.eq("validation_error");
          });
        });
      }
      listScopes(api_server.api_server_id).then((scopes) => {
        expect(scopes.map((scope) => scope.scope)).to.deep.eq(["notes:read"]);
      });
    });
  });

  it("refuses a list that would take the API server over 100 scopes with 409", () => {
    createApiServerWithJwksAccessKey().then((api_server) => {
      cy.request({
        method: "POST",
        url: `/api/apis/${api_server.api_server_id}/scopes`,
        body: { scope: "console:defined", description: "Defined in the console." },
      }).then((response) => expect(response.status, "console create").to.eq(200));

      // 100 entries pass the body schema, but 1 + 100 = 101 scopes in total.
      const scopes: ManifestEntry[] = Array.from({ length: 100 }, (_, index) => ({
        scope: `bulk:${index}`,
        description: `Bulk scope ${index}`,
      }));
      for (const dry_run of [true, false]) {
        mintAssertion(api_server).then((token) => {
          putScopes(api_server.api_server_id, { scopes }, { authorization: `Bearer ${token}`, dry_run }).then(
            (response) => {
              expect(response.status, `dry_run=${dry_run}`).to.eq(409);
              expect(response.body.error).to.eq("too_many_scopes");
            },
          );
        });
      }
      listScopes(api_server.api_server_id).then((stored) => {
        expect(stored.map((scope) => scope.scope)).to.deep.eq(["console:defined"]);
      });

      // 101 entries fail the body schema itself.
      mintAssertion(api_server).then((token) => {
        putScopes(
          api_server.api_server_id,
          { scopes: [...scopes, { scope: "bulk:100", description: "One too many" }] },
          { authorization: `Bearer ${token}` },
        ).then((response) => {
          expect(response.status).to.eq(400);
          expect(response.body.error).to.eq("validation_error");
        });
      });
    });
  });
});

describe("GET /json-schema/api-server-scopes.json", () => {
  it("serves the scope manifest's JSON Schema publicly, named after the deployment", () => {
    cy.clearAllCookies();
    getJsonSchema().then(({ response, schema }) => {
      expect(response.status).to.eq(200);
      expect(response.headers["content-type"]).to.include("application/schema+json");
      expect(response.headers["access-control-allow-origin"]).to.eq("*");
      expect(response.headers["cache-control"]).to.eq("public, max-age=3600");
      expect(schema.$schema).to.eq("https://json-schema.org/draft/2020-12/schema");
      expect(schema.$id).to.eq(new URL(JSON_SCHEMA_PATH, Cypress.env("AUTH_SERVER_URL")).toString());
      expect(schema.required).to.deep.eq(["scopes"]);
    });
  });
});
