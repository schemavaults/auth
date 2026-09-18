// Covers GET /api/config/branding, the unauthenticated endpoint the global
// error page uses to render white-label branding. It had no coverage. When
// the suite runs against a white-label deployment (the white_label suite
// sets SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME / THEME_COLOR_* in the Cypress
// env) the values must match; otherwise they only need to be well-formed.

interface BrandingConfigResponseBody {
  error: boolean;
  success: boolean;
  message: string;
  data?: { friendly_name: string; theme_colors: [string, string] };
}

// Module marker: keeps this spec's top-level interfaces file-scoped.
export {};

describe("GET /api/config/branding", () => {
  it("returns the friendly name and theme gradient colors", () => {
    cy.request<BrandingConfigResponseBody>({
      method: "GET",
      url: "/api/config/branding",
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.success).to.eq(true);
      expect(response.body.error).to.eq(false);
      const data = response.body.data;
      expect(data?.friendly_name).to.be.a("string").and.not.be.empty;
      expect(data?.theme_colors).to.be.an("array").and.have.length(2);
      for (const color of data?.theme_colors ?? []) {
        expect(color).to.be.a("string").and.not.be.empty;
      }

      const expectedName: string | undefined = Cypress.env(
        "SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME",
      );
      if (expectedName) {
        expect(data?.friendly_name).to.eq(expectedName);
      }
      const expectedColor1: string | undefined = Cypress.env(
        "SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1",
      );
      const expectedColor2: string | undefined = Cypress.env(
        "SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2",
      );
      if (expectedColor1 && expectedColor2) {
        expect(data?.theme_colors).to.deep.equal([expectedColor1, expectedColor2]);
      }
    });
  });
});
