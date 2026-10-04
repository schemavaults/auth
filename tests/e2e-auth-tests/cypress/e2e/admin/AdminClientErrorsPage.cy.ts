// Drives the /admin/client-errors dashboard and the
// /admin/client-errors/[client_error_id] detail page: access control, a
// reported error showing up in the stats, list and detail page, the URL-kept
// filters, and deleting a report. The intake's wire contract is pinned by
// api_contract/ClientErrorReportsApi.cy.ts.
import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID: string = getAuthServerAppIdFromCypressEnv();
const AUTH_SERVER_ORIGIN: string = new URL(Cypress.env("AUTH_SERVER_URL") as string).origin;

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

function reportError(message: string): Cypress.Chainable<string> {
  return cy
    .request<{ client_error_id: string }>({
      method: "POST",
      url: `/api/client-errors/${AUTH_APP_ID}`,
      headers: { Origin: AUTH_SERVER_ORIGIN, "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        name: "TypeError",
        message,
        stack: `TypeError: ${message}\n    at checkout (app.js:10:5)`,
        operation: "checkout",
        sdk_name: "@schemavaults/auth-client-sdk",
        sdk_version: "9.9.9",
        page_url: `${AUTH_SERVER_ORIGIN}/cart?coupon=SECRET`,
        context: { items: 3 },
      }),
    })
    .then((response) => {
      expect(response.status).to.eq(202);
      return response.body.client_error_id;
    });
}

describe("Admin Client Errors Pages", () => {
  const fakeId = "00000000-0000-4000-8000-000000000042";

  describe("Access control", () => {
    it("unauthenticated users are redirected off /admin/client-errors", () => {
      cy.visit("/admin/client-errors");
      cy.url().should("not.include", "/admin/client-errors");
    });

    it("non-admin users get 403 on the dashboard and the detail page", () => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then((ok: boolean) => {
          expect(ok, "regular user login").to.be.true;
          cy.visit("/admin/client-errors", { failOnStatusCode: false });
          cy.url().should("include", "error=403");
          cy.visit(`/admin/client-errors/${fakeId}`, { failOnStatusCode: false });
          cy.url().should("include", "error=403");
        });
      });
    });
  });

  describe("Admin", () => {
    beforeEach(() => {
      cy.request("POST", "/api/test/reset-rate-limit");
      cy.create_and_login_as_superuser_via_request().then((ok: boolean) =>
        expect(ok, "superuser login").to.be.true,
      );
    });

    it("shows a reported error in the stats, the list and its detail page, then deletes it", () => {
      const message = `Cart total negative ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      reportError(message).then((client_error_id: string) => {
        cy.visit(`/admin/client-errors?range=24h&q=${encodeURIComponent(message)}`);
        cy.wait_for_page_hydration();
        cy.get('[data-testid="client-errors-dashboard"]').should("exist");
        cy.get('[data-testid="client-errors-intake-status"]').should("contain.text", "Accepting reports");
        cy.get('[data-testid="client-errors-storage-meter"]').should("exist");
        cy.get('[data-testid="client-errors-stat-errors"]').should("contain.text", "1");
        cy.get('[data-testid="client-errors-top-groups"]').should("contain.text", message);
        cy.get('[data-testid="client-errors-search"]').should("have.value", message);
        cy.get('[data-testid="client-errors-list-row"]').should("have.length", 1).and("contain.text", message);

        // Filtering by the group keeps it in the URL.
        cy.get('[data-testid="client-errors-group-row"]').first().find('button[aria-pressed="false"]').click();
        cy.url().should("include", "group=");
        cy.get('[data-testid="client-errors-group-filter"]').should("contain.text", message);

        cy.get('[data-testid="client-errors-list-row"]').first().find("a").first().click();
        cy.url().should("include", `/admin/client-errors/${client_error_id}`);
        cy.get('[data-testid="admin-client-error-detail-name"]').should("contain.text", "TypeError");
        cy.get('[data-testid="admin-client-error-detail-message"]').should("contain.text", message);
        cy.get('[data-testid="admin-client-error-detail-stack"]').should("contain.text", "at checkout");
        cy.get('[data-testid="admin-client-error-detail-card"]')
          .should("contain.text", `${AUTH_SERVER_ORIGIN}/cart`)
          .and("not.contain.text", "SECRET");

        cy.get('[data-testid="delete-client-error-button"]').click();
        cy.get('[data-testid="delete-client-error-confirm"]').click();
        cy.url().should("match", /\/admin\/client-errors$/);
        cy.request({ url: `/api/admin/client-errors/${client_error_id}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 404);
      });
    });

    it("lists the dashboard in the admin navigation", () => {
      cy.visit("/admin");
      cy.wait_for_page_hydration();
      cy.get('a[href="/admin/client-errors"]').should("exist");
    });
  });
});
