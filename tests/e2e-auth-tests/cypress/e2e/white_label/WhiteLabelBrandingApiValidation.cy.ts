// Negative-path coverage for the admin branding endpoints:
//   PUT    /api/admin/branding/[asset]  (raw image bytes + Content-Type)
//   DELETE /api/admin/branding/[asset]
// Covers authorization (unauthenticated callers rejected) and the
// handler's input validation (unknown asset key, disallowed content type,
// oversize payload) plus DELETE idempotence on a never-uploaded slot.
// The happy paths are covered in WhiteLabelBrandingAssetsAdmin.cy.ts.

describe("Branding admin API validation", () => {
  describe("unauthenticated access", () => {
    it("rejects unauthenticated PUT and DELETE", () => {
      cy.request({
        method: "PUT",
        url: "/api/admin/branding/favicon",
        headers: { "content-type": "image/png" },
        body: "not-really-a-png",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.be.oneOf([401, 403]);
      });

      cy.request({
        method: "DELETE",
        url: "/api/admin/branding/favicon",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.be.oneOf([401, 403]);
      });
    });
  });

  describe("as an authenticated admin", () => {
    beforeEach(() => {
      cy.create_and_login_as_superuser_via_request().then(
        (success: boolean) => {
          if (!success) {
            throw new Error("Failed to create and login as superuser");
          }
        },
      );
    });

    it("returns 400 for an unknown branding asset key", () => {
      cy.request({
        method: "PUT",
        url: "/api/admin/branding/bogus-asset-key",
        headers: { "content-type": "image/png" },
        body: "irrelevant",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body).to.have.property("success", false);
      });
    });

    it("returns 400 for a disallowed content type", () => {
      cy.request({
        method: "PUT",
        url: "/api/admin/branding/favicon",
        headers: { "content-type": "text/plain" },
        body: "definitely not an image",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body).to.have.property("success", false);
      });
    });

    it("returns 413 for an upload exceeding the favicon size limit", () => {
      // Favicon uploads are capped at 512 KB; declare and send ~600 KB.
      cy.request({
        method: "PUT",
        url: "/api/admin/branding/favicon",
        headers: { "content-type": "image/png" },
        body: "x".repeat(600 * 1024),
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(413);
      });
    });

    it("DELETE on a never-uploaded slot succeeds (idempotent reset)", () => {
      cy.request({
        method: "DELETE",
        url: "/api/admin/branding/opengraph-image",
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property("success", true);
      });
    });
  });
});
