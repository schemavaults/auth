// Lifecycle of an app's service account through the management API
// (auth-server/src/app/api/apps/[app_id]/service-account/route.ts). Only
// GET was covered directly (client_credentials suite); the POST (201 on
// creation, 200 when it already exists), the GET shape afterwards and the
// DELETE (200, then 404) were not.

interface ServiceAccountSummary {
  uid: string;
  email: string;
  created_at: number;
  disabled: boolean;
}

interface ServiceAccountResponse {
  success: boolean;
  message?: string;
  service_account?: ServiceAccountSummary | null;
  has_client_secret?: boolean;
  created?: boolean;
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

function request(
  method: "GET" | "POST" | "DELETE",
  app_id: string,
): Cypress.Chainable<Cypress.Response<ServiceAccountResponse>> {
  return cy.request<ServiceAccountResponse>({
    method,
    url: `/api/apps/${app_id}/service-account`,
    failOnStatusCode: false,
  });
}

describe("App service account API lifecycle", () => {
  const app_id = `e2e-sa-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  before(() => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) => {
      expect(ok, "superuser login").to.be.true;
      cy.request({
        method: "POST",
        url: "/api/apps",
        body: {
          app_id,
          app_name: `Service account ${app_id}`,
          app_description: "AppServiceAccountApiLifecycle.cy.ts",
          created_at: Date.now(),
          public: true,
          hardcoded: false,
          web: false,
        },
      })
        .its("status")
        .should("eq", 200);
    });
  });

  beforeEach(() => {
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) =>
      expect(ok, "superuser login").to.be.true,
    );
  });

  after(() => {
    cy.create_and_login_as_superuser_via_request().then(() => {
      cy.request({ method: "DELETE", url: `/api/apps/${app_id}`, failOnStatusCode: false });
    });
  });

  it("GET reports no service account for a fresh public app", () => {
    request("GET", app_id).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.service_account).to.eq(null);
      expect(response.body.has_client_secret).to.eq(false);
    });
  });

  it("POST creates the service account (201) and is idempotent (200)", () => {
    request("POST", app_id).then((response) => {
      expect(response.status).to.eq(201);
      expect(response.body.success).to.eq(true);
      expect(response.body.created).to.eq(true);
      expect(response.body.service_account?.uid).to.be.a("string");
      expect(response.body.service_account?.email).to.be.a("string");
      expect(response.body.service_account?.disabled).to.eq(false);
    });
    request("POST", app_id).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.created).to.eq(false);
    });
    request("GET", app_id).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.service_account?.uid).to.be.a("string");
    });
  });

  it("DELETE removes it (200) and a second DELETE is a 404", () => {
    request("DELETE", app_id).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
    });
    request("DELETE", app_id).then((response) => {
      expect(response.status).to.eq(404);
      expect(response.body.success).to.eq(false);
    });
    request("GET", app_id).then((response) => {
      expect(response.body.service_account).to.eq(null);
    });
  });

  it("a malformed app id is a 400 for every method", () => {
    for (const method of ["GET", "POST", "DELETE"] as const) {
      request(method, "not%20a%20valid%20app%20id!").then((response) => {
        expect(response.status, method).to.eq(400);
        expect(response.body.success).to.eq(false);
      });
    }
  });

  it("an unknown app id is a 404 for GET", () => {
    request("GET", "00000000-0000-0000-0000-00000000dead").then((response) => {
      expect(response.status).to.eq(404);
      expect(response.body.success).to.eq(false);
    });
  });
});
