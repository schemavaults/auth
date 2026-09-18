// Covers the disconnect half of the app <-> API server permission endpoints,
// which only had its 401 guard tested:
//   DELETE /api/apis/[api_server_id]/connect_app/[client_app_id]
// together with the `is_allowed: false` branch of the GET permission check,
// the 409 on a duplicate connection, and the ownership guard on the GET.

interface ApiResponseBody {
  success: boolean;
  message?: string;
  is_allowed?: boolean;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
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

function createOwnAppAndApi(app_id: string, api_server_id: string): void {
  cy.request({
    method: "POST",
    url: "/api/apps",
    body: {
      app_id,
      app_name: `Disconnect E2E ${app_id}`,
      app_description: "Created by DisconnectAppFromApi.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
      web: true,
    },
  }).then((response) => expect(response.status, "app creation").to.eq(200));
  cy.request({
    method: "POST",
    url: "/api/apis",
    body: {
      api_server_id,
      api_server_name: `Disconnect E2E ${api_server_id}`,
      api_server_description: "Created by DisconnectAppFromApi.cy.ts",
      created_at: Date.now(),
      public: false,
      hardcoded: false,
    },
  }).then((response) =>
    expect(response.status, "API server creation").to.eq(200),
  );
}

function expectPermission(
  api_server_id: string,
  app_id: string,
  is_allowed: boolean,
): void {
  cy.request<ApiResponseBody>({
    method: "GET",
    url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
  }).then((response) => {
    expect(response.status).to.eq(200);
    expect(response.body.success).to.eq(true);
    expect(response.body.is_allowed).to.eq(is_allowed);
  });
}

describe("Disconnect app from API server", () => {
  it("connects, refuses a duplicate connection, disconnects, and reports the permission state throughout", () => {
    const app_id = randomId("e2e-dc-app");
    const api_server_id = randomId("e2e-dc-api");
    loginAsFreshRegularUser();
    createOwnAppAndApi(app_id, api_server_id);

    expectPermission(api_server_id, app_id, false);

    cy.request<ApiResponseBody>({
      method: "DELETE",
      url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "disconnect before connecting").to.eq(404);
      expect(response.body.success).to.eq(false);
    });

    cy.request<ApiResponseBody>({
      method: "POST",
      url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
    }).then((response) => {
      expect(response.status, "connect").to.eq(200);
      expect(response.body.success).to.eq(true);
    });

    cy.request<ApiResponseBody>({
      method: "POST",
      url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "duplicate connect").to.eq(409);
      expect(response.body.success).to.eq(false);
    });

    expectPermission(api_server_id, app_id, true);

    cy.request<ApiResponseBody>({
      method: "DELETE",
      url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
    }).then((response) => {
      expect(response.status, "disconnect").to.eq(200);
      expect(response.body.success).to.eq(true);
    });

    expectPermission(api_server_id, app_id, false);
  });

  it("returns 404 for an unknown app or API server and 400 for malformed ids", () => {
    const app_id = randomId("e2e-dc-app");
    const api_server_id = randomId("e2e-dc-api");
    loginAsFreshRegularUser();
    createOwnAppAndApi(app_id, api_server_id);

    cy.request({
      method: "DELETE",
      url: `/api/apis/${api_server_id}/connect_app/e2e-does-not-exist-xyz`,
      failOnStatusCode: false,
    }).then((response) => expect(response.status, "unknown app").to.eq(404));
    cy.request({
      method: "DELETE",
      url: `/api/apis/e2e-does-not-exist-xyz/connect_app/${app_id}`,
      failOnStatusCode: false,
    }).then((response) =>
      expect(response.status, "unknown API server").to.eq(404),
    );
    cy.request({
      method: "DELETE",
      url: `/api/apis/bad%20id/connect_app/${app_id}`,
      failOnStatusCode: false,
    }).then((response) => expect(response.status, "malformed id").to.eq(400));
  });

  it("refuses to disconnect or inspect a connection owned by someone else", () => {
    const app_id = randomId("e2e-dc-app");
    const api_server_id = randomId("e2e-dc-api");
    loginAsFreshRegularUser();
    createOwnAppAndApi(app_id, api_server_id);
    cy.request({
      method: "POST",
      url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
    }).then((response) => expect(response.status).to.eq(200));

    cy.logout();
    loginAsFreshRegularUser();
    cy.request({
      method: "DELETE",
      url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "disconnect by non-owner").to.eq(403);
      expect(response.body).to.have.property("success", false);
    });
    cy.request({
      method: "GET",
      url: `/api/apis/${api_server_id}/connect_app/${app_id}`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status, "permission check by non-owner").to.eq(403);
    });
  });
});
