// Verifies the auth-server protects the hardcoded 'schemavaults' system
// organization from being recreated or deleted via the organizations API.
// See `hardcodedOrgs` in @schemavaults/auth-common and the handlers in
// auth-server/src/app/api/organizations/.

describe("System Organization Protection", () => {
  const SCHEMAVAULTS_ORG_ID = "schemavaults";

  it("POST /api/organizations with the reserved 'schemavaults' ID returns 400", () => {
    cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }

      cy.request({
        method: "POST",
        url: "/api/organizations",
        failOnStatusCode: false,
        body: {
          organization_id: SCHEMAVAULTS_ORG_ID,
          name: "Attempted Reserved Org",
          created_at: Date.now(),
        },
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body).to.have.property("success", false);
        expect(String(response.body.message).toLowerCase()).to.include(
          "reserved",
        );
      });
    });
  });

  it("DELETE /api/organizations/schemavaults returns 403", () => {
    cy.create_and_login_as_superuser_via_request().then((success: boolean) => {
      if (!success) {
        throw new Error("Failed to create and login as superuser");
      }

      cy.request({
        method: "DELETE",
        url: `/api/organizations/${SCHEMAVAULTS_ORG_ID}`,
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(403);
        expect(response.body).to.have.property("success", false);
        expect(String(response.body.message).toLowerCase()).to.include(
          "system",
        );
      });
    });
  });
});
