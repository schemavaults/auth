// Verifies the PAGE-level authorization guard on
// auth-server/src/app/(client)/(authenticated)/apis/[api_server_id]/jwks-access-keys/page.tsx.
//
// That server component loads the API server definition, calls
// `canUserManageResource(dbh.db, user, api_server)` and, when the signed-in
// user may not manage it, calls `redirectWithError(403, 'forbidden')` — i.e.
// redirects to `/error?error=403&error_id=forbidden`.
//
// Existing coverage stops short of this branch:
//   - resource_management/JwksAccessKeyAuthorization.cy.ts covers the
//     *API* endpoints under /api/apis/:api_server_id/jwks-access-key.
//   - resource_management/JwksAccessKeySchemavaultsAuthBlocked.cy.ts covers
//     the auth server's own API server on those same endpoints.
//   - misc/UnauthenticatedRedirects.cy.ts only covers the *unauthenticated*
//     visit to this page (redirect to login).
// Nothing exercised the page itself for an authenticated-but-unauthorized
// user. If that guard regresses, the page renders for a stranger and its SSR
// preload (`preloaded_latest_jwks_access_keys_metadata`, built from
// `JwksAccessKeysRegistry.getKeyMetadata()`) leaks the API server's JWKS
// access-key state, plus a working "Generate Key" / "Regenerate" UI.
//
// A JWKS access key is generated during setup on purpose: it makes the
// leak-able metadata non-empty, so the negative assertions below are
// meaningful rather than vacuously true.

describe("JWKS access keys page for a user who cannot manage the API server", () => {
  it("redirects a signed-in non-member of the owner organization to /error?error=403&error_id=forbidden", () => {
    cy.create_and_login_as_superuser_via_request().then(
      (adminLoggedIn: boolean) => {
        expect(adminLoggedIn, "superuser login should succeed").to.be.true;

        cy.generate_random_code(12).then((randomCode: string) => {
          const organization_id = `jwks-page-authz-${randomCode.toLowerCase()}`;
          const name = `JWKS Page Authz Org ${randomCode}`;

          cy.create_organization_via_request({ organization_id, name }).then(
            () => {
              cy.create_api_server({
                api_server_name: `JWKS Page Authz API ${randomCode}`,
                api_server_description: `API server for JWKS access keys page authorization E2E test ${randomCode}`,
                organization_id,
              }).then((createResult) => {
                if (!createResult.success || !createResult.api_server_id) {
                  throw new Error(
                    `Failed to create test API server for org '${organization_id}'`,
                  );
                }
                const api_server_id: string = createResult.api_server_id;

                // Arm the metadata-leak assertions: with a key on record the
                // page would have something real to render for a stranger.
                cy.generate_jwks_access_key(api_server_id).then((keyResult) => {
                  expect(
                    keyResult.success,
                    "superuser should be able to generate the API server's JWKS access key",
                  ).to.be.true;

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

                          cy.visit(
                            `/apis/${api_server_id}/jwks-access-keys`,
                            { failOnStatusCode: false },
                          );

                          cy.url().should("include", "/error");
                          cy.url().should("include", "error=403");
                          cy.url().should("include", "error_id=forbidden");
                          cy.url().should(
                            "not.include",
                            "jwks-access-keys",
                          );

                          // The JWKS access keys page must not have rendered:
                          // neither its heading copy nor the preloaded key
                          // metadata may reach an unauthorized user.
                          cy.contains(
                            "Manage JWKS access keys for API server",
                          ).should("not.exist");
                          cy.contains(keyResult.key_id as string).should(
                            "not.exist",
                          );
                        });
                      },
                    );
                  });
                });
              });
            },
          );
        });
      },
    );
  });
});
