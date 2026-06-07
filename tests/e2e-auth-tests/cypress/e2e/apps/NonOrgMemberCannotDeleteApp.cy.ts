// Verifies that DELETE /api/apps/:app_id returns 403 when the authenticated
// caller is neither a global admin nor a member of the app's owner
// organization. This guards the authorization branch in
// auth-server/src/app/api/apps/[app_id]/DELETE_app_handler.ts that returns
// "Only organization owners or global admins can delete apps" (the
// isUserInOrganizationWithRole(..., "owner") check).
//
// The unauthenticated (401) case is covered by
// misc/UnauthenticatedApiRequests.cy.ts, and the hardcoded-app protection is
// covered by resource_management/HardcodedResourceDeletionProtection.cy.ts.
// The authenticated-non-owner branch — by far the most common authorization
// path a real caller would hit — had no E2E coverage before this test.

interface AppMutationResponseBody {
  success: boolean;
  message?: string;
}

describe("DELETE /api/apps/:app_id for non-org-member, non-admin user", () => {
  it("returns 403 when the caller is not a member of the app's owner organization", () => {
    cy.create_and_login_as_superuser_via_request().then(
      (adminLoggedIn: boolean) => {
        expect(adminLoggedIn, "superuser login should succeed").to.be.true;

        cy.generate_random_code(12).then((randomCode: string) => {
          const lowerCode = randomCode.toLowerCase();
          const organization_id = `app-del-auth-${lowerCode}`;
          const name = `App Delete Auth Org ${randomCode}`;

          cy.create_organization_via_request({ organization_id, name }).then(
            () => {
              const app_name = `App Delete Auth ${randomCode}`;
              const app_description = `App for delete-authorization E2E test ${randomCode}`;

              cy.create_app({
                app_name,
                app_description,
                organization_id,
              }).then((createResult) => {
                if (!createResult.success || !createResult.app_id) {
                  throw new Error(
                    `Failed to create test app for org '${organization_id}'`,
                  );
                }
                const app_id: string = createResult.app_id;

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

                        cy.request<AppMutationResponseBody>({
                          method: "DELETE",
                          url: `/api/apps/${app_id}`,
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
