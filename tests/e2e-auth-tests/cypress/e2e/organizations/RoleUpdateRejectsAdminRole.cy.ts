// Verifies that PATCH /api/organizations/:organization_id/members/:uid/role
// rejects requests that try to set a member's role to "admin" with a 400.
//
// "admin" is a special "virtual" role reserved for memberships in the
// hardcoded schemavaults system organization (see
// packages/auth-common/src/organizations/organization-membership-role-type.ts).
// Regular organization roles must only be "owner" or "member". The dedicated
// guard for this lives in `PATCH_member_role_handler` in
// auth-server/src/app/api/organizations/[organization_id]/members/[uid]/role/PATCH_member_role_handler.ts:
//
//   if (new_role === "admin") {
//     ... 400 "Cannot set role to 'admin'..." ...
//   }
//
// Without this guard a global admin or an org owner could elevate any member
// to the virtual "admin" role and bypass the org-scoped owner/member access
// model. This edge case had no E2E coverage:
//   - 401 (unauthenticated)        → misc/UnauthenticatedApiRequests.cy.ts
//   - 403 (non-member)             → organizations/NonMemberOrganizationApiAccess.cy.ts
//                                    (sibling routes; PATCH-role is implicitly
//                                     covered by the same guard)
//   - 400 last-owner demotion      → organizations/LastOwnerDemotionProtection.cy.ts
// but the "role=admin not allowed on regular orgs" case was not exercised.

interface OrganizationMembersResponseBody {
  success: boolean;
  message: string;
  data?: {
    members: Array<{
      uid: string;
      email: string;
      role: string;
    }>;
  };
}

describe("PATCH org member role rejects 'admin'", () => {
  it("returns 400 when an org owner tries to set a member's role to 'admin' and the role is unchanged", () => {
    cy.generate_random_test_user_credentials().then((ownerCredentials) => {
      cy.create_and_login_as_regular_user(ownerCredentials).then(
        (registered: boolean) => {
          if (!registered) {
            throw new Error(
              "Failed to register/login the regular user that will own the test org",
            );
          }

          cy.generate_random_code(12).then((randomCode: string) => {
            const organization_id = `role-admin-${randomCode.toLowerCase()}`;
            const name = `Reject Admin Role Test Org ${randomCode}`;

            // The regular user creates a brand-new organization via the API.
            // POST_create_organization_handler adds them as the sole owner.
            cy.request({
              method: "POST",
              url: "/api/organizations",
              body: {
                organization_id,
                name,
                created_at: Date.now(),
              },
            }).then((createResponse) => {
              expect(createResponse.status).to.eq(200);
              expect(createResponse.body).to.have.property("success", true);

              // Look up the owner's uid from the members list. The owner can
              // read their own org's members; at this point the owner is the
              // only member so we can target their own uid for the PATCH.
              cy.request<OrganizationMembersResponseBody>({
                method: "GET",
                url: `/api/organizations/${organization_id}/members`,
              }).then((membersResponse) => {
                expect(membersResponse.status).to.eq(200);
                const members = membersResponse.body.data?.members ?? [];
                const ownerMember = members.find(
                  (m) => m.email === ownerCredentials.email,
                );
                if (!ownerMember) {
                  throw new Error(
                    `Expected to find owner '${ownerCredentials.email}' in members list for org '${organization_id}'`,
                  );
                }
                expect(ownerMember.role).to.eq("owner");

                const target_uid = ownerMember.uid;

                // Attempt the forbidden role assignment as the org owner.
                // This is the case under test: "admin" is rejected with 400
                // by the handler's explicit `new_role === "admin"` check
                // *before* the database update is attempted.
                cy.request({
                  method: "PATCH",
                  url: `/api/organizations/${organization_id}/members/${target_uid}/role`,
                  failOnStatusCode: false,
                  body: { role: "admin" },
                }).then((response) => {
                  expect(
                    response.status,
                    "PATCH role with role='admin' should return 400",
                  ).to.eq(400);
                  expect(response.body).to.have.property("success", false);
                  expect(
                    String(response.body.message).toLowerCase(),
                    "response message should reference the 'admin' role restriction",
                  ).to.include("admin");
                });

                // Verify the target's role is unchanged: still 'owner' in
                // the organization_membership_roles table. If the rejected
                // request ever leaked through, the role would have changed.
                cy.request<OrganizationMembersResponseBody>({
                  method: "GET",
                  url: `/api/organizations/${organization_id}/members`,
                }).then((postMembersResponse) => {
                  expect(postMembersResponse.status).to.eq(200);
                  const postMembers =
                    postMembersResponse.body.data?.members ?? [];
                  const stillOwner = postMembers.find(
                    (m) => m.uid === target_uid,
                  );
                  if (!stillOwner) {
                    throw new Error(
                      "Expected the owner to still appear in the members list after the rejected role-update",
                    );
                  }
                  expect(stillOwner.role).to.eq("owner");
                });

                // Cleanup: delete the test organization.
                cy.delete_organization({ organization_id });
              });
            });
          });
        },
      );
    });
  });
});
