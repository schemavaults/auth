// Verifies that an administrator can upload custom branding images (the
// favicon and the app icon) from the admin dashboard at /admin/settings
// (BrandingAssetsCard), and that the uploads propagate to the public
// /branding/* serving routes, the /favicon.ico rewrite, the root layout's
// <link rel="icon"> cache-busted URLs, and the rendered app logo (<Logo />
// on the home page and in the dashboard layout):
//   - upload via the hidden file input -> "Branding updated" toast ->
//     row badge flips Default -> Custom -> Reset button appears
//   - GET /branding/favicon serves the uploaded bytes (new ETag/content-type)
//   - the admin metadata API reports hasCustomAsset + the content hash that
//     the served ETag and the <link rel="icon">'s ?v= param derive from
//   - Reset reverts the slot to the bundled default asset
//
// The generated opengraph-image route is sanity-checked too (no upload).

describe("Admin branding assets (favicon/icon upload from /admin/settings)", () => {
  // Idempotent cleanup so a previously failed run can't leak a custom
  // asset into this one (DELETE on a default slot is a 200 no-op).
  beforeEach(() => {
    cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }
    });
    cy.request({ method: "DELETE", url: "/api/admin/branding/favicon" })
      .its("status")
      .should("eq", 200);
    cy.request({ method: "DELETE", url: "/api/admin/branding/icon" })
      .its("status")
      .should("eq", 200);
  });

  it("uploads a custom favicon from the admin dashboard and serves it everywhere, then resets it", () => {
    // 1. Capture the default favicon's identity dynamically (bundled
    //    default is an .ico today, but don't hardcode that).
    cy.request("/branding/favicon").then((baseline) => {
      expect(baseline.status).to.eq(200);
      const defaultEtag = baseline.headers["etag"] as string;
      const defaultContentType = baseline.headers["content-type"] as string;
      expect(defaultEtag).to.be.a("string").and.not.be.empty;

      // 2. The favicon row starts on the bundled default.
      cy.visit("/admin/settings");
      cy.wait_for_page_hydration();
      // Existence (not visibility): the settings page stacks cards inside a
      // scroll container whose clipping makes Cypress's visibility check
      // false-negative for below-the-fold content in the CI viewport.
      cy.get('[data-testid="branding-assets-card"]').should("exist");
      cy.contains('[data-testid="branding-asset-row-favicon"]', "Default");
      cy.get('[data-testid="branding-asset-remove-favicon"]').should(
        "not.exist",
      );

      // 3. Upload the fixture PNG through the (hidden) file input, exactly
      //    like an administrator using the Upload button's file picker.
      cy.get('[data-testid="branding-asset-file-input-favicon"]').selectFile(
        {
          contents: "cypress/fixtures/white_label/custom-favicon.png",
          fileName: "custom-favicon.png",
          mimeType: "image/png",
        },
        { force: true },
      );

      // 4. Success toast, then the row reflects the custom asset.
      cy.contains("Branding updated", { timeout: 10000 }).should("be.visible");
      cy.contains('[data-testid="branding-asset-row-favicon"]', "Custom", {
        timeout: 10000,
      });
      cy.get('[data-testid="branding-asset-remove-favicon"]').should("exist");

      // 5. The public branding route now serves the uploaded PNG.
      cy.request("/branding/favicon").then((uploaded) => {
        expect(uploaded.status).to.eq(200);
        expect(uploaded.headers["content-type"]).to.eq("image/png");
        expect(uploaded.headers["etag"]).to.be.a("string").and.not.be.empty;
        expect(uploaded.headers["etag"]).to.not.eq(defaultEtag);
      });

      // 6. The admin metadata API agrees, and its content hash is the
      //    source of both the served ETag and the head link's ?v= param.
      cy.request("/api/admin/branding").then((metadata) => {
        expect(metadata.status).to.eq(200);
        expect(metadata.body).to.have.property("success", true);
        const assets: Array<Record<string, unknown>> =
          metadata.body.data.assets;
        const favicon = assets.find((asset) => asset["key"] === "favicon");
        expect(favicon, "favicon metadata record").to.exist;
        expect(favicon).to.have.property("hasCustomAsset", true);
        const contentHash = favicon!["contentHash"] as string;
        expect(contentHash).to.be.a("string").and.not.be.empty;

        cy.request("/branding/favicon")
          .its("headers.etag")
          .should("eq", `"${contentHash}"`);

        // 7. A fresh page render links the favicon with the new
        //    cache-busting version (first 16 chars of the content hash).
        cy.visit("/auth/login");
        cy.get('head link[rel="icon"][href^="/branding/favicon"]').should(
          "have.attr",
          "href",
          `/branding/favicon?v=${contentHash.slice(0, 16)}`,
        );

        // 8. /favicon.ico is rewritten to the branding route and serves
        //    the same uploaded asset.
        cy.request("/favicon.ico").then((rewritten) => {
          expect(rewritten.status).to.eq(200);
          expect(rewritten.headers["content-type"]).to.eq("image/png");
          expect(rewritten.headers["etag"]).to.eq(`"${contentHash}"`);
        });
      });

      // 9. Reset from the admin dashboard restores the bundled default.
      cy.visit("/admin/settings");
      cy.wait_for_page_hydration();
      cy.get('[data-testid="branding-asset-remove-favicon"]').click();
      cy.contains("Branding reset", { timeout: 10000 }).should("be.visible");
      cy.contains('[data-testid="branding-asset-row-favicon"]', "Default", {
        timeout: 10000,
      });
      cy.get('[data-testid="branding-asset-remove-favicon"]').should(
        "not.exist",
      );
      cy.request("/branding/favicon").then((restored) => {
        expect(restored.status).to.eq(200);
        expect(restored.headers["etag"]).to.eq(defaultEtag);
        expect(restored.headers["content-type"]).to.eq(defaultContentType);
      });
    });
  });

  it("uploads and resets a custom app icon from the admin dashboard", () => {
    cy.request("/branding/icon").then((baseline) => {
      expect(baseline.status).to.eq(200);
      const defaultEtag = baseline.headers["etag"] as string;

      cy.visit("/admin/settings");
      cy.wait_for_page_hydration();
      cy.contains('[data-testid="branding-asset-row-icon"]', "Default");

      cy.get('[data-testid="branding-asset-file-input-icon"]').selectFile(
        {
          contents: "cypress/fixtures/white_label/custom-icon.png",
          fileName: "custom-icon.png",
          mimeType: "image/png",
        },
        { force: true },
      );

      cy.contains("Branding updated", { timeout: 10000 }).should("be.visible");
      cy.contains('[data-testid="branding-asset-row-icon"]', "Custom", {
        timeout: 10000,
      });

      cy.request("/branding/icon").then((uploaded) => {
        expect(uploaded.status).to.eq(200);
        expect(uploaded.headers["content-type"]).to.eq("image/png");
        expect(uploaded.headers["etag"]).to.not.eq(defaultEtag);
      });

      // The uploaded icon is rendered as the app logo (via the cache-busted
      // /branding/icon URL) on the home page and in the dashboard layout.
      cy.request("/api/admin/branding").then((metadata) => {
        expect(metadata.status).to.eq(200);
        const assets: Array<Record<string, unknown>> =
          metadata.body.data.assets;
        const icon = assets.find((asset) => asset["key"] === "icon");
        expect(icon, "icon metadata record").to.exist;
        expect(icon).to.have.property("hasCustomAsset", true);
        const contentHash = icon!["contentHash"] as string;
        expect(contentHash).to.be.a("string").and.not.be.empty;
        const versionedIconUrl = `/branding/icon?v=${contentHash.slice(0, 16)}`;

        cy.visit("/");
        cy.wait_for_page_hydration();
        cy.get('img[alt$=" Logo"]')
          .first()
          .should("have.attr", "src", versionedIconUrl);
        // naturalWidth > 0 proves the browser fetched real image bytes for
        // the uploaded asset from the /branding/icon route.
        cy.get('img[alt$=" Logo"]')
          .first()
          .should(($img) => {
            expect(
              ($img[0] as HTMLImageElement).naturalWidth,
              "home page logo image loads",
            ).to.be.greaterThan(0);
          });

        // Dashboard layout (any authenticated page) shows the same icon.
        cy.visit("/account");
        cy.wait_for_page_hydration();
        cy.get('img[alt$=" Logo"]')
          .first()
          .should("have.attr", "src", versionedIconUrl);
      });

      cy.visit("/admin/settings");
      cy.wait_for_page_hydration();
      cy.get('[data-testid="branding-asset-remove-icon"]').click();
      cy.contains("Branding reset", { timeout: 10000 }).should("be.visible");
      cy.contains('[data-testid="branding-asset-row-icon"]', "Default", {
        timeout: 10000,
      });
      cy.request("/branding/icon")
        .its("headers.etag")
        .should("eq", defaultEtag);
    });
  });

  it("serves a generated opengraph image derived from the white-label branding", () => {
    // No bundled default exists for the opengraph-image slot: with nothing
    // uploaded it is generated at request time from the friendly name,
    // description, and theme colors.
    cy.request("/branding/opengraph-image").then((response) => {
      expect(response.status).to.eq(200);
      expect(response.headers["content-type"]).to.eq("image/png");
      expect(response.headers["etag"]).to.be.a("string").and.not.be.empty;
    });
  });
});
