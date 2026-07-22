// Verifies the auth-server's admin route guard rejects regular (non-admin)
// authenticated users that attempt to delete another user via
// `DELETE /api/admin/users/:uid`. The unauthenticated 401 case is covered in
// misc/UnauthenticatedApiRequests.cy.ts; this test covers the
// authenticated-but-non-admin 403 case — the privilege boundary that, if it
// ever regressed, would let any user permanently destroy another user's
// account and owned resources.

import { getAuthServerAppIdFromCypressEnv } from "@schemavaults/cypress-e2e-auth-tests-helper-commands";

const AUTH_APP_ID = getAuthServerAppIdFromCypressEnv();

describe("Regular User Cannot Delete User", () => {
  it("DELETE /api/admin/users/:uid returns 403 for a regular user and leaves the target account intact", () => {
    // 1. Create the target (victim) user and capture their uid.
    cy.generate_random_test_user_credentials().then((targetCredentials) => {
      cy.create_and_login_as_regular_user_via_request(targetCredentials).then(
        (targetCreated: boolean) => {
          expect(
            targetCreated,
            "create_and_login_as_regular_user (target) should succeed",
          ).to.be.true;
        },
      );

      cy.request({
        method: "GET",
        url: `/api/auth/whoami/${AUTH_APP_ID}`,
      }).then((whoamiResponse) => {
        expect(whoamiResponse.status).to.eq(200);
        const target_uid: unknown = whoamiResponse.body?.user?.uid;
        expect(target_uid, "whoami response should contain user uid").to.be.a(
          "string",
        );

        cy.logout();

        // 2. Create the attacker: a fresh authenticated regular user.
        cy.generate_random_test_user_credentials().then(
          (attackerCredentials) => {
            cy.create_and_login_as_regular_user_via_request(
              attackerCredentials,
            ).then((attackerCreated: boolean) => {
              expect(
                attackerCreated,
                "create_and_login_as_regular_user (attacker) should succeed",
              ).to.be.true;
            });

            cy.is_admin().then((isAdmin: boolean) => {
              expect(isAdmin, "attacker must not be an admin").to.be.false;
            });

            // 3. The non-admin's delete attempt must be rejected with 403.
            cy.request({
              method: "DELETE",
              url: `/api/admin/users/${target_uid as string}`,
              failOnStatusCode: false,
            }).then((deleteResponse) => {
              expect(deleteResponse.status).to.eq(403);
              expect(deleteResponse.body).to.have.property("success", false);
            });

            // The admin guard must short-circuit before parameter validation
            // so a non-admin can't probe uid handling. 403 must beat 400.
            cy.request({
              method: "DELETE",
              url: "/api/admin/users/not-a-uuid",
              failOnStatusCode: false,
            }).then((deleteResponse) => {
              expect(deleteResponse.status).to.eq(403);
              expect(deleteResponse.body).to.have.property("success", false);
            });

            // 4. The target account must be unaffected: logging back in as
            // the target proves the user row still exists.
            cy.logout();
            cy.login_via_request(
              targetCredentials.email,
              targetCredentials.password,
            ).then((targetStillExists: boolean) => {
              expect(
                targetStillExists,
                "target user must still be able to log in after the rejected delete attempt",
              ).to.be.true;
            });
          },
        );
      });
    });
  });
});
