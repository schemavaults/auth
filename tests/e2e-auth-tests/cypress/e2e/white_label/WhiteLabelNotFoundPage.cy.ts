// Verifies that the global 404 page (auth-server/src/app/global-not-found.tsx)
// honors the env-var driven white-label branding (injected for this suite by
// e2e-auth-tests-cli.ts) even though it renders without the root layout:
//   - the document <title> carries the custom friendly name
//   - the <Wordmark /> in the error header renders the custom friendly name
//   - the wordmark text gradient uses the custom theme colors

// Mark this spec as a module so its top-level declarations are file-scoped
// (Cypress specs without imports are otherwise global scripts).
export {};

const FRIENDLY_NAME: string = Cypress.env(
  "SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME",
);
const THEME_COLOR_1: string = Cypress.env(
  "SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1",
);
const THEME_COLOR_2: string = Cypress.env(
  "SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2",
);

const UNKNOWN_ROUTE = "/this-route-does-not-exist";

// Browsers normalize hex colors to rgb() in computed styles, so gradient
// assertions compare against the rgb form of the configured hex colors.
function hexToRgb(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    throw new Error(`Expected a 6-digit hex color, received: '${hex}'`);
  }
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgb(${r}, ${g}, ${b})`;
}

describe("White-label global 404 page", () => {
  it("renders the friendly name in the title and error header", () => {
    cy.visit(UNKNOWN_ROUTE, { failOnStatusCode: false });
    cy.title().should("include", FRIENDLY_NAME);
    cy.contains("h1", FRIENDLY_NAME).should("be.visible");
    cy.contains("p", "404: Page not found").should("be.visible");
  });

  it("renders the wordmark with the custom theme color gradient", () => {
    cy.visit(UNKNOWN_ROUTE, { failOnStatusCode: false });
    cy.contains("span", FRIENDLY_NAME)
      .first()
      .should(($el) => {
        const backgroundImage = getComputedStyle($el[0]).backgroundImage;
        expect(backgroundImage).to.include("linear-gradient");
        expect(backgroundImage).to.include(hexToRgb(THEME_COLOR_1));
        expect(backgroundImage).to.include(hexToRgb(THEME_COLOR_2));
      });
  });
});
