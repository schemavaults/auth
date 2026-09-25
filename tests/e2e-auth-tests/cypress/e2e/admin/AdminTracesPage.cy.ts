// Verifies the /admin/traces dashboard: access control (the page is gated by
// withAdminServerComponentRouteGuard, like the other admin pages), the tiles
// an admin sees by default, and that the filters live in the page URL (the
// server preloads the filtered view; changing a filter rewrites the URL).
// Traces are recorded by the server for its own request handling, so the
// login in beforeEach guarantees rows.

describe("Admin Traces Page", () => {
  describe("Unauthenticated Access", () => {
    it("unauthenticated users are redirected off /admin/traces", () => {
      cy.visit("/admin/traces");
      cy.url().should("not.include", "/admin/traces");
    });
  });

  describe("Regular User Access Restrictions", () => {
    beforeEach(() => {
      cy.generate_random_test_user_credentials().then((credentials) => {
        cy.create_and_login_as_regular_user_via_request(credentials).then(
          (loggedIn: boolean) => {
            if (!loggedIn) {
              throw new Error("Failed to create and login as regular user");
            }
          },
        );
      });
    });

    it("non-admin users are redirected from /admin/traces with 403 forbidden", () => {
      cy.visit("/admin/traces", { failOnStatusCode: false });
      cy.url().should("include", "/error");
      cy.url().should("include", "error=403");
    });
  });

  describe("Admin Access", () => {
    beforeEach(() => {
      cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
        if (!success) {
          throw new Error("Failed to create and login as superuser");
        }
      });
    });

    it("shows the filters, the summary statistics and the default tiles", () => {
      cy.visit("/admin/traces");
      cy.get('[data-testid="server-traces-dashboard"]').should("exist");
      cy.get('[data-testid="server-traces-filters"]').should("exist");
      cy.get('[data-testid="server-traces-status"]').should("contain.text", "matching traces");
      cy.get('[data-testid="trace-stat-count"]').should("exist");
      for (const tile of [
        "summary",
        "duration-histogram",
        "duration-scatter",
        "latency-over-time",
        "throughput",
        "slowest-operations",
        "busiest-operations",
        "operation-stats",
        "trace-log",
      ]) {
        cy.get(`[data-testid="trace-tile-${tile}"]`).should("exist");
      }
      // Opt-in tile.
      cy.get('[data-testid="trace-tile-category-breakdown"]').should("not.exist");
    });

    it("preloads the filters named in the URL", () => {
      cy.visit("/admin/traces?range=24h&limit=200");
      cy.get('[data-testid="server-traces-range-24h"]').should("have.attr", "aria-pressed", "true");
      cy.get('[data-testid="server-traces-limit-200"]').should("have.attr", "aria-pressed", "true");
      cy.get('[data-testid="server-traces-status"]').should("contain.text", "matching traces");
    });

    it("keeps the filters in the URL and filters by a clicked operation", () => {
      cy.visit("/admin/traces");
      cy.get('[data-testid="server-traces-range-1h"]').click();
      cy.location("search").should("include", "range=1h");

      cy.intercept("GET", "/api/admin/server-traces?*").as("listTraces");
      cy.get('[data-testid="trace-tile-busiest-operations"] button').first().click();
      cy.location("search").should("include", "op=");
      cy.wait("@listTraces").its("request.url").should("include", "op_name=");
      cy.get('[data-testid="server-traces-clear-filters"]').click();
      cy.location("search").should("not.include", "op=");
    });
  });
});
