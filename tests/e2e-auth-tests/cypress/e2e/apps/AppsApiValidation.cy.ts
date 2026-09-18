// Contract coverage for the validation, ownership and not-found branches of
// the client-application API that the UI never reaches:
//   GET  /api/apps                        -> list_apps_query_type validation,
//                                            admin-only `all`, member-only `org`,
//                                            the `public` query type
//   POST /api/apps                        -> body validation, `hardcoded`
//                                            refusal, duplicate id (409),
//                                            every requested-ownership branch
//   GET/DELETE /api/apps/[app_id]         -> 400 malformed id, 404 unknown app
//   GET/POST   /api/apps/[app_id]/domains -> 404 unknown, 403 non-member,
//                                            400 body/path id mismatch,
//                                            409 duplicate domain + environment
//   GET  /api/apps/[app_id]/check-authorization + POST /api/apps/[app_id]/authorize
//                                         -> the false -> authorize -> true
//                                            round trip and the request-body
//                                            validation of the consent POST

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

interface ApiResponseBody {
  success: boolean;
  message?: string;
  resource_id?: string;
  list?: unknown[];
  authorized?: boolean;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

const UNKNOWN_APP_ID = "e2e-does-not-exist-xyz";
const MALFORMED_APP_ID = "bad%20id";

function generateV4Uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomAppId(): string {
  return `e2e-apps-${Math.random().toString(36).slice(2, 12)}`;
}

function appBody(app_id: string, extra: Record<string, unknown> = {}) {
  return {
    app_id,
    app_name: `Apps API validation ${app_id}`,
    app_description: "Created by AppsApiValidation.cy.ts",
    created_at: Date.now(),
    public: false,
    hardcoded: false,
    web: true,
    ...extra,
  };
}

function loginAsFreshRegularUser(): Cypress.Chainable<string> {
  return cy
    .generate_random_test_user_credentials()
    .then((credentials) =>
      cy.create_and_login_as_regular_user_via_request(credentials),
    )
    .then((ok: boolean) => {
      expect(ok, "regular user registration + login").to.be.true;
      return cy
        .request({ method: "GET", url: `/api/auth/whoami/${AUTH_APP_ID}` })
        .then((whoami) => whoami.body.user.uid as string);
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

describe("Apps API validation", () => {
  describe("GET /api/apps query validation", () => {
    beforeEach(() => {
      loginAsFreshRegularUser();
    });

    it("rejects a missing or unknown list_apps_query_type with 400", () => {
      expectStatus("GET", "/api/apps", 400);
      expectStatus("GET", "/api/apps?list_apps_query_type=bogus", 400);
    });

    it("requires a valid organization_id for the org query type", () => {
      expectStatus("GET", "/api/apps?list_apps_query_type=org", 400);
      expectStatus(
        "GET",
        "/api/apps?list_apps_query_type=org&organization_id=!!",
        400,
      );
    });

    it("refuses the org listing to a non-member and the all listing to a non-admin", () => {
      expectStatus(
        "GET",
        "/api/apps?list_apps_query_type=org&organization_id=e2e-not-my-org",
        403,
      );
      expectStatus("GET", "/api/apps?list_apps_query_type=all", 403);
    });

    it("lists public apps for any authenticated user", () => {
      cy.request<ApiResponseBody>({
        method: "GET",
        url: "/api/apps?list_apps_query_type=public",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.list).to.be.an("array");
      });
    });
  });

  describe("POST /api/apps validation and ownership", () => {
    it("rejects malformed bodies, hardcoded apps and duplicate ids", () => {
      loginAsFreshRegularUser();
      const app_id = randomAppId();
      expectStatus("POST", "/api/apps", 400, { nope: true }, "unparseable body");
      expectStatus(
        "POST",
        "/api/apps",
        400,
        appBody(randomAppId(), { hardcoded: true }),
        "hardcoded: true",
      );
      expectStatus(
        "POST",
        "/api/apps",
        400,
        appBody(randomAppId(), { web: "yes" }),
        "non-boolean web",
      );
      expectStatus("POST", "/api/apps", 200, appBody(app_id), "first create");
      expectStatus(
        "POST",
        "/api/apps",
        409,
        appBody(app_id),
        "duplicate app_id",
      );
    });

    it("rejects invalid requested-ownership combinations", () => {
      loginAsFreshRegularUser().then((uid) => {
        expectStatus(
          "POST",
          "/api/apps",
          403,
          appBody(randomAppId(), { owner_type: "platform" }),
          "platform-owned by non-admin",
        );
        expectStatus(
          "POST",
          "/api/apps",
          400,
          appBody(randomAppId(), { owner_type: "organization" }),
          "organization-owned without owner_organization_id",
        );
        expectStatus(
          "POST",
          "/api/apps",
          400,
          appBody(randomAppId(), {
            owner_type: "organization",
            owner_organization_id: "e2e-some-org",
            owner_uid: uid,
          }),
          "organization-owned with owner_uid",
        );
        expectStatus(
          "POST",
          "/api/apps",
          400,
          appBody(randomAppId(), {
            owner_type: "organization",
            owner_organization_id: "schemavaults",
          }),
          "organization-owned by the platform organization",
        );
        expectStatus(
          "POST",
          "/api/apps",
          403,
          appBody(randomAppId(), {
            owner_type: "organization",
            owner_organization_id: "e2e-not-my-org",
          }),
          "organization the caller does not belong to",
        );
        expectStatus(
          "POST",
          "/api/apps",
          400,
          appBody(randomAppId(), {
            owner_type: "user",
            owner_organization_id: "e2e-some-org",
          }),
          "user-owned with owner_organization_id",
        );
      });
    });
  });

  describe("GET/DELETE /api/apps/:app_id and domains", () => {
    it("returns 400 for a malformed id and 404 for an unknown app", () => {
      loginAsFreshRegularUser();
      expectStatus("GET", `/api/apps/${MALFORMED_APP_ID}`, 400);
      expectStatus("DELETE", `/api/apps/${MALFORMED_APP_ID}`, 400);
      expectStatus("GET", `/api/apps/${UNKNOWN_APP_ID}`, 404);
      expectStatus("DELETE", `/api/apps/${UNKNOWN_APP_ID}`, 404);
      expectStatus("GET", `/api/apps/${UNKNOWN_APP_ID}/domains`, 404);
    });

    it("validates domain bodies and hides a private app's domains from non-members", () => {
      const app_id = randomAppId();
      const environment: string =
        Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test";
      loginAsFreshRegularUser();
      expectStatus("POST", "/api/apps", 200, appBody(app_id));
      const domainBody = (domain: string, env: string = environment) => ({
        app_domain_ref_id: generateV4Uuid(),
        app_id,
        domain,
        environment: env,
        created_at: Date.now(),
        hardcoded: false,
      });
      expectStatus(
        "POST",
        `/api/apps/${app_id}/domains`,
        200,
        domainBody("dup.example"),
        "first domain",
      );
      expectStatus(
        "POST",
        `/api/apps/${app_id}/domains`,
        409,
        domainBody("dup.example"),
        "same domain + environment again",
      );
      expectStatus(
        "POST",
        `/api/apps/${app_id}/domains`,
        200,
        domainBody("dup.example", environment === "test" ? "development" : "test"),
        "same domain in another environment",
      );
      expectStatus(
        "POST",
        `/api/apps/${app_id}/domains`,
        400,
        { nope: true },
        "unparseable domain body",
      );
      expectStatus(
        "POST",
        `/api/apps/${app_id}/domains`,
        400,
        {
          app_domain_ref_id: generateV4Uuid(),
          app_id: "some-other-app",
          domain: "mismatch.example",
          environment: Cypress.env("SCHEMAVAULTS_APP_ENVIRONMENT") ?? "test",
          created_at: Date.now(),
          hardcoded: false,
        },
        "body app_id differs from route",
      );

      cy.logout();
      loginAsFreshRegularUser();
      expectStatus("GET", `/api/apps/${app_id}/domains`, 403);
    });
  });

  describe("check-authorization and authorize", () => {
    it("reports the auth server's own app as always authorized", () => {
      loginAsFreshRegularUser();
      cy.request<ApiResponseBody>({
        method: "GET",
        url: `/api/apps/${AUTH_APP_ID}/check-authorization`,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.authorized).to.eq(true);
      });
      expectStatus("GET", `/api/apps/${MALFORMED_APP_ID}/check-authorization`, 400);
      expectStatus("POST", `/api/apps/${MALFORMED_APP_ID}/authorize`, 400);
    });

    it("flips check-authorization from false to true once the app is authorized", () => {
      const app_id = randomAppId();
      loginAsFreshRegularUser();
      expectStatus("POST", "/api/apps", 200, appBody(app_id));

      cy.request<ApiResponseBody>({
        method: "GET",
        url: `/api/apps/${app_id}/check-authorization`,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.authorized).to.eq(false);
      });

      // Consent POST body validation: strict schema and JSON only.
      expectStatus(
        "POST",
        `/api/apps/${app_id}/authorize`,
        400,
        { state: "abc", unexpected: true },
        "unknown body field",
      );
      cy.request({
        method: "POST",
        url: `/api/apps/${app_id}/authorize`,
        headers: { "content-type": "application/json" },
        body: "{not json",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status, "non-JSON body").to.eq(400);
      });

      cy.request<ApiResponseBody>({
        method: "POST",
        url: `/api/apps/${app_id}/authorize`,
        body: { state: `e2e-state-${Date.now()}` },
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
      });

      cy.request<ApiResponseBody>({
        method: "GET",
        url: `/api/apps/${app_id}/check-authorization`,
      }).then((response) => {
        expect(response.body.authorized).to.eq(true);
      });

      // Authorizing again is idempotent.
      expectStatus("POST", `/api/apps/${app_id}/authorize`, 200);
    });
  });
});
