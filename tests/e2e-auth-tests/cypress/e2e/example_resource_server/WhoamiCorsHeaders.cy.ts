// Regression: /api/auth/whoami/[client_app_id] used to evaluate CORS inside
// the authenticated-route guard's success callback, so 401/403 responses for
// unauthenticated cross-origin probes from registered client apps were
// returned without Access-Control-Allow-Origin. Browsers turned that into a
// CORS error, breaking useStartLoginOauthPKCEFlow's "am I already logged in?"
// probe. These tests verify CORS headers now ride on every response.

describe("whoami CORS headers", () => {
  // Seeded by cypress.config.ts before:run hook for this suite.
  const seededAppId = "00000000-0000-0000-0000-000000000000";
  const allowedOrigin = new URL(
    Cypress.env("EXAMPLE_NEXTJS_RESOURCE_SERVER_URL") ||
      "http://example-nextjs-resource-server:3007",
  ).origin;

  beforeEach(() => {
    // Ensure no auth cookies leak in from previous tests.
    cy.clearCookies();
    cy.clearAllCookies();
  });

  it("returns 401 with CORS headers for an unauthenticated request from a registered origin", () => {
    cy.request({
      method: "GET",
      url: `/api/auth/whoami/${seededAppId}`,
      headers: { Origin: allowedOrigin },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
      expect(response.headers["access-control-allow-origin"]).to.eq(
        allowedOrigin,
      );
      expect(response.headers["access-control-allow-credentials"]).to.eq(
        "true",
      );
      const vary = response.headers["vary"];
      expect(typeof vary === "string" ? vary : "").to.contain("Origin");
    });
  });

  it("returns 403 with no CORS headers for an unauthenticated request from a disallowed origin", () => {
    const disallowedOrigin = "https://attacker.example.com";
    cy.request({
      method: "GET",
      url: `/api/auth/whoami/${seededAppId}`,
      headers: { Origin: disallowedOrigin },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(403);
      expect(response.headers["access-control-allow-origin"]).to.be.undefined;
    });
  });

  it("returns 204 with CORS headers for an OPTIONS preflight from a registered origin", () => {
    cy.request({
      method: "OPTIONS",
      url: `/api/auth/whoami/${seededAppId}`,
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
      },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(204);
      expect(response.headers["access-control-allow-origin"]).to.eq(
        allowedOrigin,
      );
      const methods = response.headers["access-control-allow-methods"];
      expect(typeof methods === "string" ? methods : "").to.contain("GET");
    });
  });
});
