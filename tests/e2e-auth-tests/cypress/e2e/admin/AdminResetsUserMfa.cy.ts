// Verifies that DELETE /api/admin/users/:uid/mfa clears every enrolled MFA
// factor on the target account. This is the admin's "unlock a user who lost
// their MFA device" flow and lives in
// auth-server/src/app/api/admin/users/[uid]/mfa/route.ts
// (the `mfaRegistry.deleteAllFactorsForUser(target_uid)` call in
// `DELETE_admin_reset_handler`). Existing coverage for this route:
//   - 401 (unauthenticated GET) → misc/UnauthenticatedApiRequests.cy.ts
//   - 403 (authenticated non-admin GET) → admin/RegularUserAdminApiForbidden.cy.ts
// The admin-authenticated happy paths (both GET listing the enrolled factor
// types and DELETE actually clearing them) previously had no E2E coverage,
// so a regression that stopped the DELETE from writing — or the GET from
// reflecting the write — would slip through CI. Locking one behavior per
// spec: this file exercises the DELETE-clears-factors path via a
// before/after GET pair; the 404 branch (user not found) is intentionally
// out of scope so a failure of THIS spec unambiguously means the reset
// itself is broken.

interface AdminMfaFactorTypesResponseBody {
  success: boolean;
  message?: string;
  data?: {
    factor_types: readonly string[];
  };
}

// Module marker: keeps this spec's top-level interfaces file-scoped so they
// do not collide with same-named interfaces in other spec files.
export {};

describe("Admin resets a user's MFA factors", () => {
  it("DELETE /api/admin/users/:uid/mfa removes the user's enrolled TOTP factor", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      // 1. Create the regular user so the seed endpoint has an existing
      //    account to attach the TOTP factor to.
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(
            loggedIn,
            "create_and_login_as_regular_user should succeed",
          ).to.be.true;
          cy.logout();

          // 2. Enrol TOTP for the user via the test-only seed endpoint.
          //    This drives `MfaRegistry.createUnverifiedFactor` +
          //    `verifyFactor` — the same code paths a real enrollment goes
          //    through — so the resulting factor is indistinguishable from
          //    one added via the /mfa UI.
          cy.enroll_test_user_mfa({ email: credentials.email }).then((mfa) => {
            const target_uid: string = mfa.uid;
            expect(target_uid, "seed endpoint should return the target uid").to
              .be.a("string").and.not.be.empty;

            // 3. Login as the superuser so we can call the admin endpoints.
            cy.create_and_login_as_superuser_via_request().then(
              (adminLoggedIn: boolean) => {
                expect(adminLoggedIn, "superuser login should succeed").to.be
                  .true;

                // 4. Precondition sanity check: the admin GET reports the
                //    enrolled TOTP factor. This must hold BEFORE the DELETE
                //    or the subsequent assertion tells us nothing.
                cy.request<AdminMfaFactorTypesResponseBody>({
                  method: "GET",
                  url: `/api/admin/users/${target_uid}/mfa`,
                }).then((preResponse) => {
                  expect(
                    preResponse.status,
                    "admin GET on a user with an enrolled TOTP factor should return 200",
                  ).to.equal(200);
                  expect(preResponse.body).to.have.property("success", true);
                  const preFactors =
                    preResponse.body.data?.factor_types ?? [];
                  expect(
                    preFactors,
                    "before the reset, the enrolled TOTP factor must be reported",
                  ).to.include("totp");
                });

                // 5. The behaviour under test: admin resets MFA for the
                //    target user.
                cy.request({
                  method: "DELETE",
                  url: `/api/admin/users/${target_uid}/mfa`,
                }).then((deleteResponse) => {
                  expect(
                    deleteResponse.status,
                    "admin DELETE should return 200 on a successful reset",
                  ).to.equal(200);
                  expect(deleteResponse.body).to.have.property("success", true);
                });

                // 6. Post-condition: the admin GET now reports zero
                //    enrolled factor types. If this fails, the DELETE
                //    handler either short-circuited or silently kept the
                //    row — both of which would leave a locked-out user
                //    still locked out after an admin "reset".
                cy.request<AdminMfaFactorTypesResponseBody>({
                  method: "GET",
                  url: `/api/admin/users/${target_uid}/mfa`,
                }).then((postResponse) => {
                  expect(
                    postResponse.status,
                    "admin GET after the reset should return 200",
                  ).to.equal(200);
                  expect(postResponse.body).to.have.property("success", true);
                  const postFactors =
                    postResponse.body.data?.factor_types ?? [];
                  expect(
                    postFactors,
                    "after the reset, no MFA factor types should remain",
                  ).to.deep.equal([]);
                });
              },
            );
          });
        },
      );
    });
  });
});
