// Verifies that POST /api/apps/:app_id/authorize refuses to authorize the
// auth server's own app id, returning 403 with a message that mentions the
// app is always authorized. The auth server treats its own app as
// implicitly authorized for every signed-in user (see
// GET_check_app_authorization.ts), so persisting an explicit row for it in
// AuthorizedAppsRegistry would be nonsensical — the guard in
// auth-server/src/app/api/apps/[app_id]/authorize/POST_authorize_client_application.ts
// (`if (app_id === getAuthServerAppId()) { ... 403 ... }`, lines 61-71)
// enforces that.
//
// The auth-server app id is env-var driven
// (SCHEMAVAULTS_AUTH_SERVER_APP_ID); resolve it from the Cypress env
// instead of hardcoding "schemavaults-auth" so the check keeps working on
// a white-labelled deployment.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

describe("POST /api/apps/:auth_server_app_id/authorize", () => {
  it("returns 403 because the auth server's own app is always authorized", () => {
    const AUTH_SERVER_APP_ID = getAuthServerAppIdFromCypressEnv();

    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(loggedIn, "regular user login should succeed").to.be.true;

          cy.request({
            method: "POST",
            url: `/api/apps/${AUTH_SERVER_APP_ID}/authorize`,
            failOnStatusCode: false,
          }).then((response) => {
            expect(
              response.status,
              "authorizing the auth server's own app must be refused",
            ).to.eq(403);
            expect(response.body).to.have.property("success", false);
            expect(
              String(response.body.message ?? "").toLowerCase(),
              "message should explain the auth app is always authorized",
            ).to.include("always authorized");
          });
        },
      );
    });
  });
});
