// Verifies that DELETE /api/apis/:api_server_id returns 403 when the
// authenticated caller is neither a global admin nor a member of the API
// server's owner organization. This guards the authorization branch in
// auth-server/src/app/api/apis/[api_server_id]/DELETE_api_server_handler.ts
// that returns "Only organization owners or global admins can delete API
// servers" (the isUserInOrganizationWithRole(..., "owner") check).
//
// The unauthenticated (401) case is covered by
// misc/UnauthenticatedApiRequests.cy.ts, and the hardcoded-api-server
// protection is covered by
// resource_management/HardcodedResourceDeletionProtection.cy.ts. The
// symmetric coverage already exists for apps in
// apps/NonOrgMemberCannotDeleteApp.cy.ts, but the API-server side of this
// authorization gate previously had no E2E coverage.

interface ApiServerMutationResponseBody {
  success: boolean;
  message?: string;
}

describe("DELETE /api/apis/:api_server_id for non-org-member, non-admin user", () => {
  it("returns 403 when the caller is not a member of the API server's owner organization", () => {
    cy.create_and_login_as_superuser_via_request().then(
      (adminLoggedIn: boolean) => {
        expect(adminLoggedIn, "superuser login should succeed").to.be.true;

        cy.generate_random_code(12).then((randomCode: string) => {
          const lowerCode = randomCode.toLowerCase();
          const organization_id = `api-del-auth-${lowerCode}`;
          const name = `API Delete Auth Org ${randomCode}`;

          cy.create_organization_via_request({ organization_id, name }).then(
            () => {
              const api_server_name = `API Delete Auth ${randomCode}`;
              const api_server_description = `API server for delete-authorization E2E test ${randomCode}`;

              cy.create_api_server({
                api_server_name,
                api_server_description,
                organization_id,
              }).then((createResult) => {
                if (!createResult.success || !createResult.api_server_id) {
                  throw new Error(
                    `Failed to create test API server for org '${organization_id}'`,
                  );
                }
                const api_server_id: string = createResult.api_server_id;

                cy.logout().then(() => {
                  cy.generate_random_test_user_credentials().then(
                    (credentials) => {
                      cy.create_and_login_as_regular_user_via_request(
                        credentials,
                      ).then((regularLoggedIn: boolean) => {
                        expect(
                          regularLoggedIn,
                          "regular user login should succeed",
                        ).to.be.true;

                        cy.request<ApiServerMutationResponseBody>({
                          method: "DELETE",
                          url: `/api/apis/${api_server_id}`,
                          failOnStatusCode: false,
                        }).then((response) => {
                          expect(
                            response.status,
                            "non-org-member DELETE should return 403",
                          ).to.equal(403);
                          expect(response.body).to.have.property(
                            "success",
                            false,
                          );
                          expect(
                            String(response.body.message ?? "").toLowerCase(),
                            "message should explain owner/admin requirement",
                          ).to.include("owner");
                        });
                      });
                    },
                  );
                });
              });
            },
          );
        });
      },
    );
  });
});
