// Verifies that GET /api/apps/:app_id/check-authorization returns
// { success: true, authorized: true } for the auth server's own app id even
// when the signed-in user has never explicitly authorized any app. The
// auth-server short-circuits this check for its own app id in
// auth-server/src/app/api/apps/[app_id]/check-authorization/GET_check_app_authorization.ts
// (`if (app_id === getAuthServerAppId()) { return NextResponse.json({ ...
// authorized: true }); }`) so that a matching row in AuthorizedAppsRegistry
// is never required for the account-management surface to render for the
// user's own dashboard. This is the read-path counterpart to the
// AuthServerAppCannotBeExplicitlyAuthorized spec.
//
// The auth-server app id is env-var driven
// (SCHEMAVAULTS_AUTH_SERVER_APP_ID); resolve it from the Cypress env so this
// keeps working on a white-labelled deployment.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

describe("GET /api/apps/:auth_server_app_id/check-authorization", () => {
  it("returns authorized:true for a fresh user with no explicit authorization row", () => {
    const AUTH_SERVER_APP_ID = getAuthServerAppIdFromCypressEnv();

    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(loggedIn, "regular user login should succeed").to.be.true;

          cy.request({
            method: "GET",
            url: `/api/apps/${AUTH_SERVER_APP_ID}/check-authorization`,
            failOnStatusCode: false,
          }).then((response) => {
            expect(
              response.status,
              "check-authorization for the auth server's own app must succeed",
            ).to.eq(200);
            expect(response.body).to.have.property("success", true);
            expect(
              response.body,
              "auth server's own app must report as implicitly authorized",
            ).to.have.property("authorized", true);
          });
        },
      );
    });
  });
});
