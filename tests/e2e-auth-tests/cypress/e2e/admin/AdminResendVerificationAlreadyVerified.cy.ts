// Verifies that POST /api/admin/users/:uid/resend-verification returns 409
// when the target user's email is already verified. This guard lives in
// auth-server/src/app/api/admin/users/[uid]/resend-verification/route.ts
// (the `targetUser.email_verified` short-circuit) and exists to prevent
// admins from triggering redundant verification emails. The unauthenticated
// (401), forbidden (403) and not-found (404) cases should be covered
// elsewhere; the already-verified (409) edge case had no coverage.

interface AdminUsersListResponseBody {
  success: boolean;
  data?: {
    users: Array<{ uid: string; email: string; email_verified?: boolean }>;
  };
}

interface EmailVerificationTokenResponseBody {
  success: boolean;
  token?: string;
}

describe("Admin resend-verification rejects already-verified user", () => {
  it("POST /api/admin/users/:uid/resend-verification returns 409 when the target email is already verified", () => {
    cy.generate_random_test_user_credentials().then((credentials) => {
      // Step 1: Create the regular user (email_verified=false initially)
      cy.create_and_login_as_regular_user_via_request(credentials).then(
        (loggedIn: boolean) => {
          expect(
            loggedIn,
            "create_and_login_as_regular_user should succeed",
          ).to.be.true;
          cy.logout();

          // Step 2: Promote the user's email to verified using the test-only
          // token endpoint + the public confirm endpoint, mirroring the real
          // verification flow rather than hand-mutating the DB.
          cy.request<EmailVerificationTokenResponseBody>({
            method: "GET",
            url: `/api/test/email-verification-token/${encodeURIComponent(
              credentials.email,
            )}`,
            failOnStatusCode: false,
          }).then((tokenResponse) => {
            expect(
              tokenResponse.status,
              "test-only verification token endpoint should return 200",
            ).to.equal(200);
            expect(tokenResponse.body.success).to.be.true;
            expect(tokenResponse.body.token).to.be.a("string");
            const token: string = tokenResponse.body.token as string;

            cy.request({
              method: "POST",
              url: "/api/auth/verify-email/confirm",
              body: { token },
              failOnStatusCode: false,
            }).then((confirmResponse) => {
              expect(
                confirmResponse.status,
                "verify-email confirm should succeed",
              ).to.equal(200);
              expect(confirmResponse.body.success).to.be.true;
            });

            // Step 3: Login as superuser so we can call the admin endpoint
            cy.create_and_login_as_superuser_via_request().then(
              (adminLoggedIn: boolean) => {
                expect(
                  adminLoggedIn,
                  "superuser login should succeed",
                ).to.be.true;

                // Step 4: Resolve the target user's uid via admin user list
                cy.request<AdminUsersListResponseBody>({
                  method: "GET",
                  url: "/api/admin/users/list",
                }).then((listResponse) => {
                  expect(listResponse.status).to.equal(200);
                  expect(listResponse.body.success).to.be.true;
                  const users = listResponse.body.data?.users ?? [];
                  const target = users.find(
                    (u) => u.email === credentials.email,
                  );
                  if (!target) {
                    throw new Error(
                      `Could not find target user ${credentials.email} in admin users list`,
                    );
                  }
                  const target_uid: string = target.uid;

                  // Step 5: Attempt resend-verification on the now-verified
                  // user — this is the case under test.
                  cy.request({
                    method: "POST",
                    url: `/api/admin/users/${target_uid}/resend-verification`,
                    failOnStatusCode: false,
                  }).then((response) => {
                    expect(
                      response.status,
                      "resend-verification should return 409 when target email is already verified",
                    ).to.equal(409);
                    expect(response.body).to.have.property("success", false);
                    expect(
                      String(response.body.message).toLowerCase(),
                      "response message should reference the already-verified state",
                    ).to.include("already verified");
                  });
                });
              },
            );
          });
        },
      );
    });
  });
});
