// Verifies that GET /api/apis/:api_server_id returns 403 when the
// authenticated caller is neither a global admin nor a member of the API
// server's owner organization, AND the API server is not public. This guards
// the authorization branch in
// auth-server/src/app/api/apis/[api_server_id]/GET_api_server_handler.ts that
// returns "You are not authorized to view this API server" (the
// `if (!apiServer.public && !user.admin) { ... !authorized ... return 403 }`
// block around lines 118-139 of GET_api_server_handler.ts).
//
// The unauthenticated (401) case is covered by
// misc/UnauthenticatedApiRequests.cy.ts. The symmetric DELETE branch is
// covered by apis/NonOrgMemberCannotDeleteApiServer.cy.ts, and the parallel
// GET-app authorization gate is covered by apps/NonOrgMemberCannotGetApp.cy.ts.
// The GET-private-api-server authorization gate previously had no E2E
// coverage, even though it is what prevents an arbitrary signed-in user from
// reading metadata for any organization's private API servers by guessing or
// learning an api_server_id.

interface GetApiServerResponseBody {
  success: boolean;
  message?: string;
  api_server?: unknown;
}

describe("GET /api/apis/:api_server_id for non-org-member, non-admin user", () => {
  it("returns 403 when the caller is not a member of the private API server's owner organization", () => {
    cy.create_and_login_as_superuser_via_request().then(
      (adminLoggedIn: boolean) => {
        expect(adminLoggedIn, "superuser login should succeed").to.be.true;

        cy.generate_random_code(12).then((randomCode: string) => {
          const lowerCode = randomCode.toLowerCase();
          const organization_id = `api-get-auth-${lowerCode}`;
          const name = `API Get Auth Org ${randomCode}`;

          cy.create_organization_via_request({ organization_id, name }).then(
            () => {
              const api_server_name = `API Get Auth ${randomCode}`;
              const api_server_description = `API server for GET-authorization E2E test ${randomCode}`;

              // `cy.create_api_server` defaults to `public: false`, which is
              // the precondition that arms the authorization guard under
              // test: public API servers are readable by any signed-in user.
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

                        cy.request<GetApiServerResponseBody>({
                          method: "GET",
                          url: `/api/apis/${api_server_id}`,
                          failOnStatusCode: false,
                        }).then((response) => {
                          expect(
                            response.status,
                            "non-org-member GET on a private API server should return 403",
                          ).to.equal(403);
                          expect(response.body).to.have.property(
                            "success",
                            false,
                          );
                          expect(
                            String(response.body.message ?? "").toLowerCase(),
                            "message should explain the caller is not authorized to view this API server",
                          ).to.include("not authorized");
                          expect(
                            response.body,
                            "the rejected response must not leak the api_server payload",
                          ).to.not.have.property("api_server");
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
