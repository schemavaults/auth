// Verifies the global 404 page (auth-server/src/app/global-not-found.tsx)
// rendered for URLs that match no route at all:
//   - the response carries an HTTP 404 status
//   - the @schemavaults/ui <ErrorPage /> renders a "404: Page not found" header
//   - the reset button navigates back to the home page

// Mark this spec as a module so its top-level declarations are file-scoped
// (Cypress specs without imports are otherwise global scripts).
export {};

const UNKNOWN_ROUTE = "/this-route-does-not-exist";

describe("Global 404 page", () => {
  it("responds with an HTTP 404 status for an unknown route", () => {
    cy.request({ url: UNKNOWN_ROUTE, failOnStatusCode: false })
      .its("status")
      .should("eq", 404);
  });

  it("renders the 404 error page for an unknown route", () => {
    cy.visit(UNKNOWN_ROUTE, { failOnStatusCode: false });
    cy.title().should("include", "Page Not Found");
    cy.contains("h1", "Error").should("be.visible");
    cy.contains("p", "404: Page not found").should("be.visible");
    cy.contains("button", "Return Home").should("be.visible");
  });

  it("returns to the home page when the reset button is clicked", () => {
    cy.visit(UNKNOWN_ROUTE, { failOnStatusCode: false });
    // No auth provider is mounted on the global 404 page, so only wait for
    // React hydration (the reset button's click handler) — not auth readiness.
    cy.wait_for_page_hydration({ waitForAuthReady: false });
    cy.contains("button", "Return Home").should("be.visible").click();
    cy.location("pathname").should("eq", "/");
    cy.wait_for_page_hydration();
    cy.contains("Welcome to").should("be.visible");
  });
});
