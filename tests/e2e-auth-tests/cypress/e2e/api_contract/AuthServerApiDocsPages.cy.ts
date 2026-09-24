// The auth server's generated API reference pages (/docs and /docs/<slug>),
// rendered by @schemavaults/openapi-docs-ui from the same OpenAPI document
// served at /api/openapi.json. They are public: no session is needed.

// Module marker: keeps this spec's top-level declarations file-scoped.
export {};

describe("API reference pages (/docs)", () => {
  beforeEach(() => {
    cy.clearCookies();
  });

  it("is linked from the home page and lists the API grouped by tag", () => {
    cy.visit("/");
    cy.wait_for_page_hydration();
    cy.get('[data-testid="api-docs-link"]').click();
    cy.url({ timeout: 15000 }).should("match", /\/docs\/?$/);

    cy.get('[data-testid="api-docs-page"]').should("be.visible");
    cy.get("h1").should("contain.text", "API");
    cy.contains(Cypress.env("AUTH_SERVER_URL")).should("be.visible");
    cy.contains("a", "/api/openapi.json").should("have.attr", "href", "/api/openapi.json");

    // Security schemes and tag groups from the document.
    cy.contains("Auth server session (refresh token cookie)").should("exist");
    cy.contains("Authentication").should("exist");
    cy.contains("Administration").should("exist");
    cy.contains("Client applications").should("exist");
  });

  it("renders an operation page with its auth requirements and a curl example", () => {
    // The docs pages live outside the (client) route group, so there is no
    // hydration marker to wait for; they are server-rendered.
    cy.visit("/docs");
    cy.contains("a", "/api/user/profile").first().click();
    cy.url({ timeout: 15000 }).should("include", "/docs/get-api-user-profile");
    cy.contains("Authentication & permissions").should("exist");
    cy.contains("Any authenticated user").should("exist");
    cy.contains("Responses").should("exist");
    cy.contains("curl").should("exist");

    cy.visit("/docs/get-api-admin-users-list");
    cy.contains("Platform administrators only").should("exist");

    cy.visit("/docs/post-api-oidc-token");
    cy.contains("application/x-www-form-urlencoded").should("exist");
  });

  it("answers 404 for an unknown operation slug", () => {
    cy.request({ url: "/docs/get-api-nope", failOnStatusCode: false })
      .its("status")
      .should("eq", 404);
  });
});
