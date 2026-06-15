// Verifies that GET /api/apps/:app_id returns 403 when the authenticated
// caller is neither a global admin nor a member of the app's owner
// organization, AND the app is not public. This guards the authorization
// branch in auth-server/src/app/api/apps/[app_id]/GET_app_handler.ts that
// returns "You are not authorized to view this app" (the
// `if (!app.public && !user.admin) { ... !authorized ... return 403 }` block
// around lines 111-132 of GET_app_handler.ts).
//
// The unauthenticated (401) case is covered by
// misc/UnauthenticatedApiRequests.cy.ts and the symmetric DELETE branch is
// covered by apps/NonOrgMemberCannotDeleteApp.cy.ts. The GET-private-app
// authorization gate previously had no E2E coverage, even though it is what
// prevents an arbitrary signed-in user from reading metadata for any
// organization's private apps by guessing/learning an app_id.

interface GetAppResponseBody {
  success: boolean;
  message?: string;
  app?: unknown;
}

describe("GET /api/apps/:app_id for non-org-member, non-admin user", () => {
  it("returns 403 when the caller is not a member of the private app's owner organization", () => {
    cy.create_and_login_as_superuser_via_request().then(
      (adminLoggedIn: boolean) => {
        expect(adminLoggedIn, "superuser login should succeed").to.be.true;

        cy.generate_random_code(12).then((randomCode: string) => {
          const lowerCode = randomCode.toLowerCase();
          const organization_id = `app-get-auth-${lowerCode}`;
          const name = `App Get Auth Org ${randomCode}`;

          cy.create_organization_via_request({ organization_id, name }).then(
            () => {
              const app_name = `App Get Auth ${randomCode}`;
              const app_description = `App for GET-authorization E2E test ${randomCode}`;

              // `cy.create_app` defaults to `public: false`, which is the
              // precondition that arms the authorization guard under test:
              // public apps are readable by any signed-in user.
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

                        cy.request<GetAppResponseBody>({
                          method: "GET",
                          url: `/api/apps/${app_id}`,
                          failOnStatusCode: false,
                        }).then((response) => {
                          expect(
                            response.status,
                            "non-org-member GET on a private app should return 403",
                          ).to.equal(403);
                          expect(response.body).to.have.property(
                            "success",
                            false,
                          );
                          expect(
                            String(response.body.message ?? "").toLowerCase(),
                            "message should explain the caller is not authorized to view this app",
                          ).to.include("not authorized");
                          expect(
                            response.body,
                            "the rejected response must not leak the app payload",
                          ).to.not.have.property("app");
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
