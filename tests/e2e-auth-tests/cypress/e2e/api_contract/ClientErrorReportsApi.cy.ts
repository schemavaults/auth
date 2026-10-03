// Pins the wire contract of the client error reporting intake
// (POST /api/client-errors/{client_app_id}, which @schemavaults/auth-client-sdk
// reports to unless an app sets `disable_telemetry`) and of the administrator
// endpoints that browse the reports (/api/admin/client-errors/**):
//
// - the SDK sends `text/plain` JSON without credentials (a CORS simple
//   request); the intake parses it and answers 202 with CORS headers for an
//   origin registered for the app;
// - an origin not registered for the app is refused (403) and nothing is
//   stored, an unknown app is 404, a web app's report without an Origin is
//   403, an invalid report is 400 and a body over 64 KiB is 413;
// - the OPTIONS preflight follows the same per-app origin policy;
// - the stored page URL keeps no query string or fragment;
// - the admin endpoints list, summarize, fetch and delete reports, and are
//   refused without an administrator session.
import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID: string = getAuthServerAppIdFromCypressEnv();
const AUTH_SERVER_ORIGIN: string = new URL(Cypress.env("AUTH_SERVER_URL") as string).origin;
const FOREIGN_ORIGIN = "https://not-registered.example.com";

interface ReportAccepted {
  success: true;
  client_error_id: string;
}

interface AdminClientError {
  client_error_id: string;
  client_app_id: string;
  fingerprint: string;
  name: string;
  message: string;
  operation: string | null;
  page_url: string | null;
  origin: string | null;
  sdk_version: string | null;
  context: Record<string, unknown> | null;
}

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

function unique(label: string): string {
  return `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function sendReport(
  body: unknown,
  options: { origin?: string | null; client_app_id?: string; contentType?: string } = {},
): Cypress.Chainable<Cypress.Response<unknown>> {
  const headers: Record<string, string> = {
    "Content-Type": options.contentType ?? "text/plain;charset=UTF-8",
  };
  const origin = options.origin === undefined ? AUTH_SERVER_ORIGIN : options.origin;
  if (origin !== null) headers.Origin = origin;
  return cy.request({
    method: "POST",
    url: `/api/client-errors/${encodeURIComponent(options.client_app_id ?? AUTH_APP_ID)}`,
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers,
    failOnStatusCode: false,
  });
}

function findReports(q: string): Cypress.Chainable<AdminClientError[]> {
  return cy
    .request<{ data: { errors: AdminClientError[]; total: number } }>(
      `/api/admin/client-errors?q=${encodeURIComponent(q)}`,
    )
    .then((response) => {
      expect(response.status).to.eq(200);
      return response.body.data.errors;
    });
}

describe("Client error reports API", () => {
  beforeEach(() => {
    // Reports are rate limited per IP; every spec in the run shares one IP.
    cy.request("POST", "/api/test/reset-rate-limit");
    cy.create_and_login_as_superuser_via_request().then((ok: boolean) =>
      expect(ok, "superuser login").to.be.true,
    );
  });

  it("accepts a text/plain report from a registered origin, with CORS headers, and stores it", () => {
    const message = unique("Token exchange failed");
    sendReport({
      name: "TypeError",
      message,
      operation: "acquireAccessToken",
      sdk_name: "@schemavaults/auth-client-sdk",
      sdk_version: "9.9.9",
      app_env: "test",
      page_url: `${AUTH_SERVER_ORIGIN}/auth/callback?code=secret-code&state=s#fragment`,
      context: { status: 502 },
    }).then((response) => {
      expect(response.status).to.eq(202);
      expect(response.headers["access-control-allow-origin"]).to.eq(AUTH_SERVER_ORIGIN);
      const accepted = response.body as ReportAccepted;
      expect(accepted.success).to.eq(true);
      expect(accepted.client_error_id).to.match(/^[0-9a-f-]{36}$/);

      findReports(message).then((errors) => {
        expect(errors).to.have.length(1);
        const stored = errors[0]!;
        expect(stored.client_error_id).to.eq(accepted.client_error_id);
        expect(stored.client_app_id).to.eq(AUTH_APP_ID);
        expect(stored.name).to.eq("TypeError");
        expect(stored.operation).to.eq("acquireAccessToken");
        expect(stored.sdk_version).to.eq("9.9.9");
        expect(stored.origin).to.eq(AUTH_SERVER_ORIGIN);
        expect(stored.page_url).to.eq(`${AUTH_SERVER_ORIGIN}/auth/callback`);
        expect(stored.context).to.deep.eq({ status: 502 });
        expect(stored.fingerprint).to.match(/^[0-9a-f]{32}$/);

        cy.request<{ data: AdminClientError }>(`/api/admin/client-errors/${accepted.client_error_id}`).then((one) => {
          expect(one.status).to.eq(200);
          expect(one.body.data.message).to.eq(message);
        });
      });
    });
  });

  it("refuses an origin not registered for the app and stores nothing", () => {
    const message = unique("Foreign origin report");
    sendReport({ name: "Error", message }, { origin: FOREIGN_ORIGIN }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.headers).to.not.have.property("access-control-allow-origin");
      findReports(message).then((errors) => expect(errors).to.have.length(0));
    });
  });

  it("refuses unknown apps, web-app reports without an Origin, invalid reports and oversized bodies", () => {
    sendReport({ name: "Error", message: "x" }, { client_app_id: "no-such-app-for-client-errors" })
      .its("status")
      .should("eq", 404);
    sendReport({ name: "Error", message: "x" }, { origin: null }).its("status").should("eq", 403);
    sendReport({ message: "a report without a name" }).then((response) => {
      expect(response.status).to.eq(400);
      expect(response.headers["access-control-allow-origin"]).to.eq(AUTH_SERVER_ORIGIN);
    });
    sendReport({ name: "Error", message: "x".repeat(70 * 1024) }).its("status").should("eq", 413);
  });

  it("answers the CORS preflight per the app's registered origins", () => {
    const preflight = (origin: string) =>
      cy.request({
        method: "OPTIONS",
        url: `/api/client-errors/${AUTH_APP_ID}`,
        headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
        failOnStatusCode: false,
      });
    preflight(AUTH_SERVER_ORIGIN).then((response) => {
      expect(response.status).to.eq(204);
      expect(response.headers["access-control-allow-origin"]).to.eq(AUTH_SERVER_ORIGIN);
      expect(String(response.headers["access-control-allow-methods"])).to.include("POST");
    });
    preflight(FOREIGN_ORIGIN).its("status").should("eq", 403);
  });

  it("summarizes, groups and deletes reports", () => {
    const tag = unique("Grouping check");
    // Same error twice (the numbers differ, the fingerprint does not) plus a different one.
    sendReport({ name: "Error", message: `${tag}: request 1 failed`, operation: "refreshUserData" }).its("status").should("eq", 202);
    sendReport({ name: "Error", message: `${tag}: request 2 failed`, operation: "refreshUserData" }).its("status").should("eq", 202);
    sendReport({ name: "RangeError", message: `${tag}: something else` }).its("status").should("eq", 202);

    cy.request<{ data: Record<string, any> }>(
      `/api/admin/client-errors/stats?q=${encodeURIComponent(tag)}&since=${Date.now() - 60 * 60 * 1000}`,
    ).then((response) => {
      expect(response.status).to.eq(200);
      const stats = response.body.data;
      expect(stats.totals.errors).to.eq(3);
      expect(stats.totals.groups).to.eq(2);
      expect(stats.totals.apps).to.eq(1);
      expect(stats.top_groups[0].count).to.eq(2);
      expect(stats.top_groups[0].operation).to.eq("refreshUserData");
      expect(stats.by_app).to.deep.eq([
        { client_app_id: AUTH_APP_ID, count: 3, groups: 2, last_seen: stats.by_app[0].last_seen },
      ]);
      const timelineTotal = (stats.timeline as { count: number }[]).reduce((sum, bucket) => sum + bucket.count, 0);
      expect(timelineTotal).to.eq(3);

      const fingerprint: string = stats.top_groups[0].fingerprint;
      cy.request<{ data: { errors: AdminClientError[]; total: number } }>(
        `/api/admin/client-errors?fingerprint=${fingerprint}&limit=1`,
      ).then((page) => {
        expect(page.body.data.total).to.eq(2);
        expect(page.body.data.errors).to.have.length(1);
        const id = page.body.data.errors[0]!.client_error_id;
        cy.request({ method: "DELETE", url: `/api/admin/client-errors/${id}` }).its("status").should("eq", 200);
        cy.request({ method: "DELETE", url: `/api/admin/client-errors/${id}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 404);
      });
    });
  });

  it("refuses the admin endpoints without an administrator session", () => {
    cy.clearAllCookies();
    cy.request({ url: "/api/admin/client-errors", failOnStatusCode: false }).its("status").should("eq", 401);
    cy.request({ url: "/api/admin/client-errors/stats", failOnStatusCode: false }).its("status").should("eq", 401);
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) => {
        expect(ok, "regular user login").to.be.true;
        cy.request({ url: "/api/admin/client-errors", failOnStatusCode: false }).its("status").should("eq", 403);
      });
    });
  });
});
