// Verifies the env-var driven white-label branding surfaces of the auth
// server when running with custom SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME,
// _DESCRIPTION, and _THEME_COLOR_1/2 values (injected for this suite by
// e2e-auth-tests-cli.ts):
//   - document <title> and head metadata (description, og:*, twitter:*)
//   - the <Wordmark /> text on the login, register, and home pages
//   - the wordmark text gradient and page background gradient theme colors
//   - the <link rel="icon"> tags pointing at the /branding/* routes
//
// Expected values are read from Cypress env (fed by the same docker-compose
// interpolation as the auth-server container) rather than hardcoded, so the
// CLI stays the single source of truth for the white-label configuration.

const FRIENDLY_NAME: string = Cypress.env(
  "SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME",
);
const DESCRIPTION: string = Cypress.env("SCHEMAVAULTS_AUTH_SERVER_DESCRIPTION");
const THEME_COLOR_1: string = Cypress.env(
  "SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1",
);
const THEME_COLOR_2: string = Cypress.env(
  "SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2",
);

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

describe("White-label branding (env-driven)", () => {
  it("renders the friendly name in the login page title and sign-in card", () => {
    cy.visit("/auth/login");
    cy.wait_for_page_hydration();
    cy.title().should("eq", FRIENDLY_NAME);
    cy.contains("Sign in to").should("be.visible");
    cy.contains(FRIENDLY_NAME).should("be.visible");
  });

  it("emits the white-label metadata in the document head", () => {
    cy.visit("/auth/login");
    cy.get('head meta[name="description"]').should(
      "have.attr",
      "content",
      DESCRIPTION,
    );
    cy.get('head meta[property="og:title"]').should(
      "have.attr",
      "content",
      FRIENDLY_NAME,
    );
    cy.get('head meta[property="og:site_name"]').should(
      "have.attr",
      "content",
      FRIENDLY_NAME,
    );
    cy.get('head meta[property="og:description"]').should(
      "have.attr",
      "content",
      DESCRIPTION,
    );
    cy.get('head meta[name="twitter:title"]').should(
      "have.attr",
      "content",
      FRIENDLY_NAME,
    );
    // Favicon + app icon links point at the runtime branding routes. The
    // ?v= content-hash suffix is asserted in the admin upload spec instead,
    // since uploads change it.
    cy.get('head link[rel="icon"][href^="/branding/favicon"]').should("exist");
    cy.get('head link[rel="icon"][href^="/branding/icon"]').should("exist");
    cy.get('head link[rel="apple-touch-icon"][href^="/branding/icon"]').should(
      "exist",
    );
  });

  it("renders the friendly name on the home and register pages", () => {
    cy.visit("/");
    cy.wait_for_page_hydration();
    cy.contains("Welcome to").should("be.visible");
    cy.contains(FRIENDLY_NAME).should("be.visible");

    cy.visit("/auth/register");
    cy.wait_for_page_hydration();
    cy.contains("Register for").should("be.visible");
    cy.contains(FRIENDLY_NAME).should("be.visible");
  });

  it("renders the wordmark with the custom theme color gradient", () => {
    cy.visit("/auth/login");
    cy.wait_for_page_hydration();
    cy.contains("span", FRIENDLY_NAME)
      .first()
      .should(($el) => {
        const backgroundImage = getComputedStyle($el[0]).backgroundImage;
        expect(backgroundImage).to.include("linear-gradient");
        // Assert both colors are present without pinning their order (the
        // wordmark uses [color 1, color 2]).
        expect(backgroundImage).to.include(hexToRgb(THEME_COLOR_1));
        expect(backgroundImage).to.include(hexToRgb(THEME_COLOR_2));
      });
  });

  it("renders the page background with the custom theme color gradient", () => {
    cy.visit("/auth/login");
    cy.wait_for_page_hydration();
    cy.get("div.schemavaults-themed-page-background")
      .first()
      .should(($el) => {
        const backgroundImage = getComputedStyle($el[0]).backgroundImage;
        expect(backgroundImage).to.include("linear-gradient");
        // The page background deliberately inverts the tuple to
        // [color 2, color 1], so only assert both colors are present.
        expect(backgroundImage).to.include(hexToRgb(THEME_COLOR_1));
        expect(backgroundImage).to.include(hexToRgb(THEME_COLOR_2));
      });
  });
});
