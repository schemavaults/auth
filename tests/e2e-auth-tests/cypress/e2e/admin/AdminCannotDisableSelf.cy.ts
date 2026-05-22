// Verifies that POST /api/admin/users/:uid/disable refuses to disable an admin's
// own account. This guard lives in
// auth-server/src/app/api/admin/users/[uid]/disable/route.ts (the
// `user.uid === target_uid` check in `setDisabledHandler`) and exists so an
// admin cannot accidentally lock themselves out of the platform. The happy
// path (admin disabling another user) is already covered by
// login/DisabledUserLoginBlocked.cy.ts, but the self-target
// edge case had no coverage.

interface AdminUsersListResponseBody {
  success: boolean;
  data?: {
    users: Array<{ uid: string; email: string }>;
  };
}

describe("Admin cannot disable own account", () => {
  it("POST /api/admin/users/:uid/disable returns 400 when admin targets their own uid", () => {
    cy.create_and_login_as_superuser().then((loggedIn: boolean) => {
      expect(loggedIn, "superuser login should succeed").to.be.true;

      const adminEmail: string = Cypress.env("PRIVATE_SUPERUSER_EMAIL");
      expect(
        adminEmail,
        "PRIVATE_SUPERUSER_EMAIL must be set for this test",
      ).to.be.a("string").and.not.be.empty;

      cy.request<AdminUsersListResponseBody>({
        method: "GET",
        url: "/api/admin/users/list",
      }).then((listResponse) => {
        expect(listResponse.status).to.equal(200);
        expect(listResponse.body.success).to.be.true;
        const users = listResponse.body.data?.users ?? [];
        const self = users.find((u) => u.email === adminEmail);
        if (!self) {
          throw new Error(
            `Could not find superuser ${adminEmail} in admin users list`,
          );
        }
        const own_uid: string = self.uid;

        cy.request({
          method: "POST",
          url: `/api/admin/users/${own_uid}/disable`,
          failOnStatusCode: false,
        }).then((response) => {
          expect(
            response.status,
            "self-disable attempt should return 400",
          ).to.equal(400);
          expect(response.body).to.have.property("success", false);
          expect(
            String(response.body.message).toLowerCase(),
            "response message should reference the self-disable restriction",
          ).to.include("your own");
        });
      });
    });
  });
});
