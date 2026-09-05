// Verifies that an invite code's `max_uses` limit is actually enforced at
// registration time.
//
// The enforcement lives inside the create-user database transaction
// (auth-server/src/lib/auth-db/users/create-user.ts): before inserting the new
// user it looks the invite code up, counts how many users already registered
// with it (countInviteCodeUsages) and throws when the count has reached
// `max_uses`. Because that check and the user INSERT share one transaction, a
// rejected registration must leave *no* trace behind - the usage count has to
// stay put.
//
// Existing coverage stops short of this: register/InviteCodes.cy.ts only
// creates an invite code as a superuser and checks the ?invite_code= prefill on
// the register form, and register/Register.cy.ts never re-uses a code. Neither
// the exhaustion path nor the admin usage-count endpoint
// (GET /api/admin/invite-codes/[invite_code]/usages) was exercised.

describe("Invite Code Max Uses", () => {
  const INVITE_CODE_LENGTH: number = 24;
  const MAX_USES: number = 1;

  function readInviteCodeUsageCount(
    invite_code: string,
  ): Cypress.Chainable<number> {
    return cy
      .request({
        method: "GET",
        url: `/api/admin/invite-codes/${invite_code}/usages`,
        failOnStatusCode: false,
      })
      .then((response): number => {
        expect(
          response.status,
          "GET /api/admin/invite-codes/:invite_code/usages as an admin",
        ).to.eq(200);
        expect(response.body).to.have.property("success", true);
        expect(response.body.data).to.have.property("invite_code", invite_code);
        const usage_count: unknown = response.body.data.usage_count;
        expect(usage_count, "usage_count in the response body").to.be.a(
          "number",
        );
        return usage_count as number;
      });
  }

  it("rejects a registration that re-uses an invite code whose max_uses is exhausted", () => {
    cy.generate_random_code(INVITE_CODE_LENGTH).then((invite_code: string) => {
      // 1. Provision a single-use invite code as the superuser.
      cy.create_and_login_as_superuser_via_request().then(
        (success: boolean) => {
          if (!success) {
            throw new Error("Failed to create and login as superuser");
          }
        },
      );
      cy.request({
        method: "POST",
        url: "/api/admin/invite-codes",
        failOnStatusCode: false,
        body: {
          invite_code,
          max_uses: MAX_USES,
          created_at: Date.now(),
          description: "max_uses enforcement E2E test",
        },
      }).then((response) => {
        expect(response.status, "POST /api/admin/invite-codes").to.eq(200);
        expect(response.body).to.have.property("success", true);
      });
      readInviteCodeUsageCount(invite_code).then((usage_count: number) => {
        expect(
          usage_count,
          "a freshly created invite code has no usages yet",
        ).to.eq(0);
      });

      // 2. The first registration consumes the code's only available use.
      cy.clearCookies();
      cy.generate_random_test_user_credentials().then((first_user) => {
        cy.register_via_request(
          first_user.email,
          first_user.password,
          invite_code,
        ).then((status: number) => {
          expect(
            status,
            "first registration with an unused single-use invite code",
          ).to.eq(200);
        });
      });

      // 3. A second registration with the same code must be refused. The
      //    auth-server surfaces the transaction failure as a 5xx today rather
      //    than a 4xx, so assert on the contract that matters - the request is
      //    not accepted - instead of pinning the exact status code.
      cy.clearCookies();
      cy.generate_random_test_user_credentials().then((second_user) => {
        cy.register_via_request(
          second_user.email,
          second_user.password,
          invite_code,
        ).then((status: number) => {
          expect(
            status,
            "second registration re-using an exhausted single-use invite code",
          ).to.not.eq(200);
          expect(
            status,
            "second registration re-using an exhausted single-use invite code",
          ).to.be.at.least(400);
        });
      });

      // 4. The rejected registration must have been rolled back entirely: the
      //    invite code still shows exactly the one use from step 2.
      cy.clearCookies();
      cy.create_and_login_as_superuser_via_request().then(
        (success: boolean) => {
          if (!success) {
            throw new Error("Failed to log back in as superuser");
          }
        },
      );
      readInviteCodeUsageCount(invite_code).then((usage_count: number) => {
        expect(
          usage_count,
          "the rejected registration must not have created a user against the invite code",
        ).to.eq(MAX_USES);
      });
    });
  });
});
