// Contract coverage for the validation and not-found branches of the API
// server endpoints that the UI never reaches:
//   GET  /api/apis                          -> list_apis_query_type validation,
//                                              admin-only `all`, member-only `org`
//   POST /api/apis                          -> body validation, `hardcoded`
//                                              refusal, duplicate id (409),
//                                              platform ownership 403
//   GET/DELETE /api/apis/[api_server_id]    -> 400 malformed id, 404 unknown
//   GET/POST   /api/apis/[api_server_id]/domains -> 404 unknown, 403 non-member,
//                                              400 body/path id mismatch,
//                                              409 duplicate domain + environment
//   GET/POST   /api/apis/[api_server_id]/jwks-access-key -> `key_metadata: false`
//                                              before a key exists, 409 on a
//                                              second POST, 400 malformed id

interface ApiResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
  key_metadata?: false | Record<string, unknown>;
  private_key?: string;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const UNKNOWN_ID = "e2e-does-not-exist-xyz";
const MALFORMED_ID = "bad%20id";

function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomApiServerId(): string {
  return `e2e-apis-${Math.random().toString(36).slice(2, 12)}`;
}

function apiServerBody(
  api_server_id: string,
  extra: Record<string, unknown> = {},
) {
  return {
    api_server_id,
    api_server_name: `APIs validation ${api_server_id}`,
    api_server_description: "Created by ApiServersApiValidation.cy.ts",
    created_at: Date.now(),
    public: false,
    hardcoded: false,
    ...extra,
  };
}

function loginAsFreshRegularUser(): void {
  cy.generate_random_test_user_credentials()
    .then((credentials) =>
      cy.create_and_login_as_regular_user_via_request(credentials),
    )
    .then((ok: boolean) => {
      expect(ok, "regular user registration + login").to.be.true;
    });
}

function expectStatus(
  method: "GET" | "POST" | "DELETE",
  url: string,
  status: number,
  body?: Cypress.RequestBody,
  label?: string,
): void {
  cy.request<ApiResponseBody>({
    method,
    url,
    body,
    failOnStatusCode: false,
  }).then((response) => {
    expect(response.status, label ?? `${method} ${url}`).to.eq(status);
    if (status >= 400) {
      expect(response.body.success, `${label ?? url} success flag`).to.eq(
        false,
      );
    }
  });
}

describe("API servers API validation", () => {
  beforeEach(() => {
    loginAsFreshRegularUser();
  });

  it("GET /api/apis validates the query type and enforces admin/member scoping", () => {
    expectStatus("GET", "/api/apis", 400);
    expectStatus("GET", "/api/apis?list_apis_query_type=bogus", 400);
    expectStatus("GET", "/api/apis?list_apis_query_type=org", 400);
    expectStatus(
      "GET",
      "/api/apis?list_apis_query_type=org&organization_id=!!",
      400,
    );
    expectStatus(
      "GET",
      "/api/apis?list_apis_query_type=org&organization_id=e2e-not-my-org",
      403,
    );
    expectStatus("GET", "/api/apis?list_apis_query_type=all", 403);
  });

  it("POST /api/apis rejects malformed bodies, hardcoded servers, platform ownership and duplicate ids", () => {
    const api_server_id = randomApiServerId();
    expectStatus("POST", "/api/apis", 400, { nope: true }, "unparseable body");
    expectStatus(
      "POST",
      "/api/apis",
      400,
      apiServerBody(randomApiServerId(), { hardcoded: true }),
      "hardcoded: true",
    );
    expectStatus(
      "POST",
      "/api/apis",
      403,
      apiServerBody(randomApiServerId(), { owner_type: "platform" }),
      "platform-owned by non-admin",
    );
    expectStatus(
      "POST",
      "/api/apis",
      200,
      apiServerBody(api_server_id),
      "first create",
    );
    expectStatus(
      "POST",
      "/api/apis",
      409,
      apiServerBody(api_server_id),
      "duplicate api_server_id",
    );
  });

  it("returns 400 for a malformed id and 404 for an unknown API server", () => {
    expectStatus("GET", `/api/apis/${MALFORMED_ID}`, 400);
    expectStatus("GET", `/api/apis/${UNKNOWN_ID}`, 404);
    expectStatus("DELETE", `/api/apis/${UNKNOWN_ID}`, 404);
    expectStatus("GET", `/api/apis/${UNKNOWN_ID}/domains`, 404);
    expectStatus("GET", `/api/apis/${MALFORMED_ID}/jwks-access-key`, 400);
  });

  it("validates domain bodies and hides a private API server's domains from non-members", () => {
    const api_server_id = randomApiServerId();
    const environment: string =
      Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test";
    expectStatus("POST", "/api/apis", 200, apiServerBody(api_server_id));
    const domainBody = (domain: string, env: string = environment) => ({
      api_server_domain_ref_id: generateV4Uuid(),
      api_server_id,
      domain,
      environment: env,
      created_at: Date.now(),
      hardcoded: false,
    });
    expectStatus(
      "POST",
      `/api/apis/${api_server_id}/domains`,
      200,
      domainBody("dup-api.example"),
      "first domain",
    );
    expectStatus(
      "POST",
      `/api/apis/${api_server_id}/domains`,
      409,
      domainBody("dup-api.example"),
      "same domain + environment again",
    );
    expectStatus(
      "POST",
      `/api/apis/${api_server_id}/domains`,
      200,
      domainBody("dup-api.example", environment === "test" ? "development" : "test"),
      "same domain in another environment",
    );
    expectStatus(
      "POST",
      `/api/apis/${api_server_id}/domains`,
      400,
      { nope: true },
      "unparseable domain body",
    );
    expectStatus(
      "POST",
      `/api/apis/${api_server_id}/domains`,
      400,
      {
        api_server_domain_ref_id: generateV4Uuid(),
        api_server_id: "some-other-api",
        domain: "mismatch.example",
        environment: Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test",
        created_at: Date.now(),
        hardcoded: false,
      },
      "body api_server_id differs from route",
    );

    cy.logout();
    loginAsFreshRegularUser();
    expectStatus("GET", `/api/apis/${api_server_id}/domains`, 403);
  });

  it("reports no JWKS access key metadata until one is generated, then refuses a second POST", () => {
    const api_server_id = randomApiServerId();
    expectStatus("POST", "/api/apis", 200, apiServerBody(api_server_id));

    cy.request<ApiResponseBody>({
      method: "GET",
      url: `/api/apis/${api_server_id}/jwks-access-key`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.key_metadata).to.eq(false);
    });

    cy.generate_jwks_access_key(api_server_id).then(({ success, key_id }) => {
      expect(success, "key generation").to.be.true;
      expect(key_id).to.be.a("string");
    });

    cy.request<ApiResponseBody>({
      method: "GET",
      url: `/api/apis/${api_server_id}/jwks-access-key`,
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.key_metadata).to.be.an("object");
    });

    expectStatus(
      "POST",
      `/api/apis/${api_server_id}/jwks-access-key`,
      409,
      undefined,
      "second key generation",
    );
  });
});
