// Verifies the auth-server's admin route guard rejects regular (non-admin)
// authenticated users that attempt to promote a user to superuser via
// `POST /api/admin/promote/:uid`. The unauthenticated 401 case is already
// covered in misc/UnauthenticatedApiRequests.cy.ts; this test covers the
// authenticated-but-non-admin 403 case, which is the security boundary that
// would allow self-promotion to admin if it ever regressed.

import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";

describe("Regular User Cannot Promote To Admin", () => {
  it("POST /api/admin/promote/:uid returns 403 when the caller is a regular user attempting self-promotion", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (success: boolean) => {
          expect(
            success,
            "create_and_login_as_regular_user should succeed",
          ).to.be.true;

          cy.is_admin().then((isAdminBefore: boolean) => {
            expect(
              isAdminBefore,
              "newly created regular user should not be admin",
            ).to.be.false;
          });

          cy.request({
            method: "GET",
            url: `/api/auth/whoami/${SCHEMAVAULTS_AUTH_APP_ID}`,
          }).then((whoamiResponse) => {
            expect(whoamiResponse.status).to.eq(200);
            const uid: unknown = whoamiResponse.body?.user?.uid;
            expect(uid, "whoami response should contain user uid").to.be.a(
              "string",
            );

            cy.request({
              method: "POST",
              url: `/api/admin/promote/${uid as string}`,
              failOnStatusCode: false,
            }).then((promoteResponse) => {
              expect(promoteResponse.status).to.eq(403);
              expect(promoteResponse.body).to.have.property("success", false);
            });

            cy.is_admin().then((isAdminAfter: boolean) => {
              expect(
                isAdminAfter,
                "regular user must not gain admin after rejected promote attempt",
              ).to.be.false;
            });
          });
        },
      );
    });
  });
});
