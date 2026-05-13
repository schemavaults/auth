// Verifies the auth-server refuses to demote the last owner of an
// organization via PATCH /api/organizations/:organization_id/members/:uid/role.
//
// The "last owner" guard lives in `OrganizationsRegistry.updateMemberRole` in
// auth-server/src/lib/auth-db/organizations/organizations-registry.ts and is
// surfaced by `PATCH_member_role_handler` as HTTP 400 with the message
// "Cannot demote the last owner of an organization!". Without this protection
// an org could be left without any owner, leaving members unable to manage
// invitations, role changes, or deletion.
//
// Setup: a fresh regular user creates a brand-new org via POST /api/organizations,
// which makes them the sole `owner` member (see POST_create_organization_handler
// in auth-server/src/app/api/organizations/POST_create_handler.ts). A global
// admin (superuser) then tries to demote them to `member`. The request must be
// rejected with 400 and the user must remain an owner.

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

describe("Last Owner Demotion Protection", () => {
  it("PATCH members/:uid/role refuses to demote the only owner of an organization (400)", () => {
    cy.generate_random_test_user_credentials().then((ownerCredentials) => {
      cy.create_and_login_as_regular_user_via_request(ownerCredentials).then(
        (registered: boolean) => {
          if (!registered) {
            throw new Error(
              "Failed to register/login the regular user that will own the test org",
            );
          }

          cy.generate_random_code(12).then((randomCode: string) => {
            const organization_id = `last-owner-${randomCode.toLowerCase()}`;
            const name = `Last Owner Test Org ${randomCode}`;

            // The regular user creates a brand-new organization via the API.
            // POST_create_organization_handler will add them as the sole
            // owner of the new org.
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

              // Look up the owner's uid from the members list. The regular
              // user can read their own org's members, and at this point
              // they are the only row in `organization_membership_roles`
              // for this org.
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
                expect(
                  members.filter((m) => m.role === "owner"),
                  "the test setup must produce exactly one owner",
                ).to.have.lengthOf(1);

                const owner_uid = ownerMember.uid;

                // Switch to the superuser (a global admin authorised to
                // change roles in any org) and attempt to demote the sole
                // owner to `member`.
                cy.logout();
                cy.create_and_login_as_superuser_via_request().then((suSuccess) => {
                  if (!suSuccess) {
                    throw new Error("Failed to login as superuser");
                  }

                  cy.request({
                    method: "PATCH",
                    url: `/api/organizations/${organization_id}/members/${owner_uid}/role`,
                    failOnStatusCode: false,
                    body: { role: "member" },
                  }).then((demoteResponse) => {
                    expect(demoteResponse.status).to.eq(400);
                    expect(demoteResponse.body).to.have.property(
                      "success",
                      false,
                    );
                    expect(
                      String(demoteResponse.body.message).toLowerCase(),
                    ).to.include("last owner");
                  });

                  // Verify the owner's role is unchanged: still 'owner' in
                  // the organization_membership_roles table.
                  cy.request<OrganizationMembersResponseBody>({
                    method: "GET",
                    url: `/api/organizations/${organization_id}/members`,
                  }).then((postMembersResponse) => {
                    expect(postMembersResponse.status).to.eq(200);
                    const postMembers =
                      postMembersResponse.body.data?.members ?? [];
                    const stillOwner = postMembers.find(
                      (m) => m.uid === owner_uid,
                    );
                    if (!stillOwner) {
                      throw new Error(
                        "Expected the owner to still appear in the members list after the rejected demotion",
                      );
                    }
                    expect(stillOwner.role).to.eq("owner");
                  });

                  // Cleanup: delete the test organization as superuser.
                  cy.delete_organization({ organization_id });
                });
              });
            });
          });
        },
      );
    });
  });
});
