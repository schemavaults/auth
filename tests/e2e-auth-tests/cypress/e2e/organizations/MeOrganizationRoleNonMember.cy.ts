// Verifies that GET /api/me/organizations/:organization_id/role returns 404
// for an authenticated user who is NOT a member of the (existing) organization.
// This guard lives in
// auth-server/src/app/api/me/organizations/[organization_id]/role/route.ts
// (the `if (!membership)` branch in `GET_my_organization_role_handler`) and
// exists so that non-members cannot probe the role-lookup endpoint to confirm
// or deny their own membership against another org.
//
// The unauthenticated (401) case is already covered by
// misc/UnauthenticatedApiRequests.cy.ts. The "wrong-namespace" sibling
// endpoints under /api/organizations/:org_id/* are covered by
// organizations/NonMemberOrganizationApiAccess.cy.ts (which expects 403). The
// /me/ namespace deliberately returns 404 instead of 403 to avoid leaking
// org existence to non-members, and that path had no E2E coverage.

interface MeOrganizationRoleResponseBody {
  success: boolean;
  message?: string;
}

describe("GET /api/me/organizations/:org_id/role for non-member", () => {
  it("returns 404 when the authenticated user is not a member of the org", () => {
    cy.create_and_login_as_superuser_via_request().then((adminLoggedIn: boolean) => {
      expect(adminLoggedIn, "superuser login should succeed").to.be.true;

      cy.generate_random_code(12).then((randomCode: string) => {
        const organization_id = `me-role-nm-${randomCode.toLowerCase()}`;
        const name = `Me Role Non-Member Org ${randomCode}`;

        cy.create_organization({ organization_id, name }).then(() => {
          cy.logout().then(() => {
            cy.generate_random_test_user_credentials().then((credentials) => {
              cy.create_and_login_as_regular_user_via_request(credentials).then(
                (regularLoggedIn: boolean) => {
                  expect(
                    regularLoggedIn,
                    "regular user login should succeed",
                  ).to.be.true;

                  cy.request<MeOrganizationRoleResponseBody>({
                    method: "GET",
                    url: `/api/me/organizations/${organization_id}/role`,
                    failOnStatusCode: false,
                  }).then((response) => {
                    expect(
                      response.status,
                      "non-member role lookup should return 404",
                    ).to.equal(404);
                    expect(response.body).to.have.property("success", false);
                    expect(
                      String(response.body.message ?? "").toLowerCase(),
                      "response message should reference non-membership",
                    ).to.include("not a member");
                  });
                },
              );
            });
          });
        });
      });
    });
  });
});
