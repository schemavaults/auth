// Verifies that POST /api/organizations/:organization_id/invitations returns
// 409 when an owner attempts to invite a user who is ALREADY a member of the
// organization (i.e. the invitee has previously accepted an invitation and now
// appears in `organization_membership_roles`). This guards the
// `inviteeMemberships.includes(organization_id)` short-circuit in
// auth-server/src/app/api/organizations/[organization_id]/invitations/route.ts:
//
//   const inviteeMemberships = await registry.listUserOrganizationMembershipIds(...);
//   if (inviteeMemberships.includes(organization_id)) {
//     ... 409 "User is already a member of this organization" ...
//   }
//
// Existing coverage for this endpoint:
//   - 401 (unauthenticated)                → misc/UnauthenticatedApiRequests.cy.ts
//   - 403 (non-owner authenticated)        → organizations/NonMemberOrganizationApiAccess.cy.ts
//   - 409 (duplicate pending invitation)   → organizations/DuplicatePendingInvitationRejected.cy.ts
//
// The 409 pending-invitation branch and the 409 already-a-member branch are
// two DIFFERENT short-circuits in the same handler with different DB lookups
// (a scan of pending invitations vs a scan of accepted memberships). A
// regression that removed the membership check while leaving the pending
// check in place would let owners re-invite an existing member, which could
// spam the invitee, cause the accepter-notification email to fire again, or
// (worse) reset their role if the accepter helper is ever changed to
// re-insert the membership row. This test pins down the membership branch.

interface CreateInvitationResponseBody {
  success: boolean;
  message: string;
  data?: {
    invitation: {
      invitation_id: string;
      organization_id: string;
      invitee_uid: string;
      status: string;
    };
  };
}

interface RespondToInvitationResponseBody {
  success: boolean;
  message: string;
}

interface OrganizationMembersResponseBody {
  success: boolean;
  data?: {
    members: Array<{
      uid: string;
      email: string;
      role: string;
    }>;
  };
}

// Module marker: keeps this spec's top-level interfaces file-scoped so they
// do not collide with same-named interfaces in other spec files.
export {};

describe("Cannot invite user who is already a member", () => {
  it("POST /api/organizations/:organization_id/invitations returns 409 after the invitee has accepted a prior invitation", () => {
    cy.generate_random_code(12).then((randomCode: string) => {
      const organization_id = `already-mem-${randomCode.toLowerCase()}`;
      const name = `Already-Member Invitation Test Org ${randomCode}`;

      cy.generate_random_test_user_credentials().then((memberCredentials) => {
        // 1. Create the future-member account so the org invitation lookup
        //    (which resolves email -> uid) succeeds.
        cy.create_and_login_as_regular_user_via_request(memberCredentials).then(
          (createdMember: boolean) => {
            if (!createdMember) {
              throw new Error("Failed to create prospective member user");
            }
            cy.logout();

            // 2. Login as the superuser (acts as the org owner). Superuser
            //    is the simplest way to create an org and issue invitations
            //    without threading owner-role setup through this spec.
            cy.create_and_login_as_superuser_via_request().then(
              (suSuccess: boolean) => {
                if (!suSuccess) {
                  throw new Error("Failed to login as superuser");
                }

                cy.create_organization_via_request({
                  organization_id,
                  name,
                }).then(() => {
                  // 3. Issue the FIRST invitation — should succeed (201) and
                  //    be created in status 'pending'.
                  cy.request<CreateInvitationResponseBody>({
                    method: "POST",
                    url: `/api/organizations/${organization_id}/invitations`,
                    body: {
                      input_mode: "email",
                      identifier: memberCredentials.email,
                    },
                    failOnStatusCode: false,
                  }).then((firstInviteResponse) => {
                    expect(
                      firstInviteResponse.status,
                      "first invitation should succeed",
                    ).to.equal(201);
                    expect(firstInviteResponse.body.success).to.equal(true);
                    const invitation_id =
                      firstInviteResponse.body.data?.invitation.invitation_id;
                    if (!invitation_id) {
                      throw new Error(
                        "Expected the first invitation response to include an invitation_id",
                      );
                    }
                    expect(
                      firstInviteResponse.body.data?.invitation.status,
                    ).to.equal("pending");

                    // 4. Switch to the invitee and accept the invitation.
                    //    After the PATCH the invitee is a real 'member' of
                    //    the organization — this is the precondition that
                    //    arms the "already a member" branch under test.
                    cy.logout();
                    cy.login_via_request(
                      memberCredentials.email,
                      memberCredentials.password,
                    ).then((memberLoggedIn: boolean) => {
                      if (!memberLoggedIn) {
                        throw new Error("Failed to login as invitee");
                      }

                      cy.request<RespondToInvitationResponseBody>({
                        method: "PATCH",
                        url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
                        body: { action: "accept" },
                      }).then((acceptResponse) => {
                        expect(
                          acceptResponse.status,
                          "invitee should be able to accept their invitation",
                        ).to.equal(200);
                        expect(acceptResponse.body.success).to.equal(true);
                      });

                      // 5. Switch back to the superuser and attempt a SECOND
                      //    invitation for the same user. This is the case
                      //    under test: server must reject with 409 because
                      //    the invitee is already a member (NOT because a
                      //    pending invitation exists — the previous one is
                      //    now in status 'accepted', so the pending-duplicate
                      //    guard would not trigger).
                      cy.logout();
                      cy.create_and_login_as_superuser_via_request().then(
                        (suRelogged: boolean) => {
                          if (!suRelogged) {
                            throw new Error(
                              "Failed to re-login as superuser after acceptance",
                            );
                          }

                          // Sanity-check: the invitee actually appears as a
                          // 'member' in the members list. If this fails then
                          // the precondition wasn't established and the
                          // subsequent 409 assertion would be meaningless.
                          cy.request<OrganizationMembersResponseBody>({
                            method: "GET",
                            url: `/api/organizations/${organization_id}/members`,
                          }).then((membersResponse) => {
                            expect(membersResponse.status).to.equal(200);
                            const members =
                              membersResponse.body.data?.members ?? [];
                            const inviteeMember = members.find(
                              (m) => m.email === memberCredentials.email,
                            );
                            if (!inviteeMember) {
                              throw new Error(
                                `Expected invitee '${memberCredentials.email}' to appear in the members list after accepting the invitation`,
                              );
                            }
                            expect(inviteeMember.role).to.equal("member");
                          });

                          cy.request<CreateInvitationResponseBody>({
                            method: "POST",
                            url: `/api/organizations/${organization_id}/invitations`,
                            body: {
                              input_mode: "email",
                              identifier: memberCredentials.email,
                            },
                            failOnStatusCode: false,
                          }).then((secondInviteResponse) => {
                            expect(
                              secondInviteResponse.status,
                              "re-inviting an existing member should return 409",
                            ).to.equal(409);
                            expect(secondInviteResponse.body).to.have.property(
                              "success",
                              false,
                            );
                            expect(
                              String(
                                secondInviteResponse.body.message,
                              ).toLowerCase(),
                              "response message should reference the existing membership",
                            ).to.include("already a member");
                            expect(
                              secondInviteResponse.body,
                              "rejected response must not leak a newly created invitation",
                            ).to.not.have.property("data");
                          });

                          // 6. Cleanup — delete the test org.
                          cy.delete_organization({ organization_id });
                        },
                      );
                    });
                  });
                });
              },
            );
          },
        );
      });
    });
  });
});
