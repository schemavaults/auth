// Verifies the admin-only DELETE endpoints for the errors/exceptions table:
//   DELETE /api/admin/errors?before=<ISO|ms-epoch>
//   DELETE /api/admin/errors/[error_id]
//
// The 401 (unauthenticated) and 403 (authenticated non-admin) cases for these
// routes are covered in misc/UnauthenticatedApiRequests.cy.ts and
// admin/RegularUserAdminApiForbidden.cy.ts respectively. This file covers the
// admin-accepted paths so we know the guard hand-off to the handler works:
// input validation (400), not-found handling (404), and a clean bulk-delete
// success (200).

describe("Admin Errors API", () => {
  const nonexistentErrorId = "00000000-0000-0000-0000-000000000099";

  beforeEach(() => {
    cy.create_and_login_as_superuser().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }
    });
  });

  describe("DELETE /api/admin/errors", () => {
    it("returns 400 when the 'before' search parameter is missing", () => {
      cy.request({
        method: "DELETE",
        url: "/api/admin/errors",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body).to.have.property("success", false);
      });
    });

    it("returns 400 when the 'before' search parameter is not parseable", () => {
      cy.request({
        method: "DELETE",
        url: "/api/admin/errors?before=not-a-real-datetime",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body).to.have.property("success", false);
      });
    });

    it("returns 200 with a success payload for an admin with a valid 'before'", () => {
      cy.request({
        method: "DELETE",
        url: `/api/admin/errors?before=${encodeURIComponent(
          new Date(0).toISOString(),
        )}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property("success", true);
        expect(response.body).to.have.property("resource_id");
      });
    });
  });

  describe("DELETE /api/admin/errors/[error_id]", () => {
    it("returns 400 for a non-UUID error_id", () => {
      cy.request({
        method: "DELETE",
        url: "/api/admin/errors/not-a-uuid",
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body).to.have.property("success", false);
      });
    });

    it("returns 404 when the error_id does not exist", () => {
      cy.request({
        method: "DELETE",
        url: `/api/admin/errors/${nonexistentErrorId}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(404);
        expect(response.body).to.have.property("success", false);
      });
    });
  });
});
