// Verifies the auth-server enforces an owner-only authorization check on
// DELETE /api/organizations/:organization_id/invitations/:invitation_id.
//
// A regular `member` of an organization (i.e. someone who joined via an
// accepted invitation but was never promoted to `owner`) must NOT be able to
// revoke a pending invitation issued by an owner. Without this guard a
// non-owner could cancel another org owner's pending invitation, so the
// failure of this test indicates an authorization regression.
//
// The relevant authorization check lives in `DELETE_revoke_invitation_handler`
// in auth-server/src/app/api/organizations/[organization_id]/invitations/[invitation_id]/route.ts:
//
//   if (!user.admin && (!userMembership || userMembership.role !== "owner")) {
//     ... 403 "Only organization owners can revoke invitations" ...
//   }
//
// Existing coverage:
//   - 401 (unauthenticated) is covered by misc/UnauthenticatedApiRequests.cy.ts.
//   - 403 (authenticated NON-member) is covered indirectly by sibling routes
//     in organizations/NonMemberOrganizationApiAccess.cy.ts, but DELETE on
//     an invitation specifically — and the "authenticated MEMBER but not owner"
//     case in particular — was not exercised by any existing test.

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

interface ListOrganizationInvitationsResponseBody {
  success: boolean;
  data?: {
    invitations: Array<{
      invitation_id: string;
      status: string;
    }>;
  };
}

describe("Only org owners can revoke invitations", () => {
  it("DELETE /api/organizations/:org_id/invitations/:invitation_id returns 403 when caller is a non-owner member", () => {
    cy.generate_random_code(12).then((randomCode: string) => {
      const organization_id = `revoke-owner-${randomCode.toLowerCase()}`;
      const name = `Revoke Owner-Only Test Org ${randomCode}`;

      // memberCredentials: the user who will be a non-owner `member` of the org
      // and attempt the forbidden DELETE.
      // outsiderCredentials: the user who will be the *target* of a pending
      // invitation that the member tries (and must fail) to revoke.
      cy.generate_random_test_user_credentials().then((memberCredentials) => {
        cy.generate_random_test_user_credentials().then(
          (outsiderCredentials) => {
            // 1. Pre-create the member account so we can later invite + accept.
            cy.create_and_login_as_regular_user(memberCredentials).then(
              (createdMember: boolean) => {
                if (!createdMember) {
                  throw new Error("Failed to create non-owner member user");
                }
                cy.logout();

                // 2. Pre-create the outsider so the owner can issue an
                //    invitation referencing their email.
                cy.create_and_login_as_regular_user(outsiderCredentials).then(
                  (createdOutsider: boolean) => {
                    if (!createdOutsider) {
                      throw new Error(
                        "Failed to create outsider invitee user",
                      );
                    }
                    cy.logout();

                    // 3. Become the org owner (superuser counts as a global
                    //    admin and is the simplest way to create the org +
                    //    issue invitations in this test setup).
                    cy.create_and_login_as_superuser().then(
                      (suSuccess: boolean) => {
                        if (!suSuccess) {
                          throw new Error("Failed to login as superuser");
                        }

                        cy.create_organization({ organization_id, name }).then(
                          () => {
                            // 4. Owner invites the future non-owner member.
                            cy.request<CreateInvitationResponseBody>({
                              method: "POST",
                              url: `/api/organizations/${organization_id}/invitations`,
                              body: {
                                input_mode: "email",
                                identifier: memberCredentials.email,
                              },
                            }).then((memberInviteResponse) => {
                              expect(memberInviteResponse.status).to.eq(201);
                              const member_invitation_id =
                                memberInviteResponse.body.data?.invitation
                                  .invitation_id;
                              if (!member_invitation_id) {
                                throw new Error(
                                  "Expected invitation_id for the future member",
                                );
                              }

                              // 5. The member accepts their invitation. After
                              //    this they hold role 'member' (NOT 'owner')
                              //    in the organization — see
                              //    auth-server/src/lib/auth-db/organizations/respond-to-invitation.ts.
                              cy.logout();
                              cy.login(
                                memberCredentials.email,
                                memberCredentials.password,
                              ).then((memberLoggedIn: boolean) => {
                                if (!memberLoggedIn) {
                                  throw new Error(
                                    "Failed to login as future member",
                                  );
                                }

                                cy.request<RespondToInvitationResponseBody>({
                                  method: "PATCH",
                                  url: `/api/organizations/${organization_id}/invitations/${member_invitation_id}`,
                                  body: { action: "accept" },
                                }).then((acceptResponse) => {
                                  expect(acceptResponse.status).to.eq(200);
                                  expect(acceptResponse.body.success).to.eq(
                                    true,
                                  );
                                });

                                // Sanity-check: the member's role is now
                                // 'member', not 'owner'. This is the precise
                                // precondition the owner-only DELETE guard is
                                // protecting against.
                                cy.request<{
                                  success: boolean;
                                  data?: { role: string };
                                }>({
                                  method: "GET",
                                  url: `/api/me/organizations/${organization_id}/role`,
                                }).then((roleResponse) => {
                                  expect(roleResponse.status).to.eq(200);
                                  expect(roleResponse.body.data?.role).to.eq(
                                    "member",
                                  );
                                });

                                // 6. Switch back to the superuser/owner and
                                //    issue the invitation that the member
                                //    will try to revoke.
                                cy.logout();
                                cy.create_and_login_as_superuser().then(() => {
                                  cy.request<CreateInvitationResponseBody>({
                                    method: "POST",
                                    url: `/api/organizations/${organization_id}/invitations`,
                                    body: {
                                      input_mode: "email",
                                      identifier: outsiderCredentials.email,
                                    },
                                  }).then((outsiderInviteResponse) => {
                                    expect(outsiderInviteResponse.status).to.eq(
                                      201,
                                    );
                                    const target_invitation_id =
                                      outsiderInviteResponse.body.data
                                        ?.invitation.invitation_id;
                                    if (!target_invitation_id) {
                                      throw new Error(
                                        "Expected invitation_id for the outsider invitation",
                                      );
                                    }
                                    expect(
                                      outsiderInviteResponse.body.data
                                        ?.invitation.status,
                                    ).to.eq("pending");

                                    // 7. Login as the non-owner member and
                                    //    attempt the forbidden DELETE.
                                    cy.logout();
                                    cy.login(
                                      memberCredentials.email,
                                      memberCredentials.password,
                                    ).then((memberReLoggedIn: boolean) => {
                                      if (!memberReLoggedIn) {
                                        throw new Error(
                                          "Failed to re-login as non-owner member",
                                        );
                                      }

                                      cy.request({
                                        method: "DELETE",
                                        url: `/api/organizations/${organization_id}/invitations/${target_invitation_id}`,
                                        failOnStatusCode: false,
                                      }).then((deleteResponse) => {
                                        expect(deleteResponse.status).to.eq(
                                          403,
                                        );
                                        expect(
                                          deleteResponse.body,
                                        ).to.have.property("success", false);
                                        expect(
                                          String(
                                            deleteResponse.body.message,
                                          ).toLowerCase(),
                                        ).to.include(
                                          "only organization owners",
                                        );
                                      });

                                      // 8. The outsider's invitation MUST
                                      //    still be present and still in
                                      //    'pending' status — i.e. the
                                      //    rejected DELETE had no
                                      //    side-effect on org state.
                                      cy.logout();
                                      cy.create_and_login_as_superuser().then(
                                        () => {
                                          cy.request<ListOrganizationInvitationsResponseBody>(
                                            {
                                              method: "GET",
                                              url: `/api/organizations/${organization_id}/invitations`,
                                            },
                                          ).then((listResponse) => {
                                            expect(listResponse.status).to.eq(
                                              200,
                                            );
                                            const invitations =
                                              listResponse.body.data
                                                ?.invitations ?? [];
                                            const stillPending =
                                              invitations.find(
                                                (inv) =>
                                                  inv.invitation_id ===
                                                  target_invitation_id,
                                              );
                                            if (!stillPending) {
                                              throw new Error(
                                                "Expected the outsider invitation to remain after the rejected DELETE",
                                              );
                                            }
                                            expect(stillPending.status).to.eq(
                                              "pending",
                                            );
                                          });

                                          // 9. Cleanup.
                                          cy.delete_organization({
                                            organization_id,
                                          });
                                        },
                                      );
                                    });
                                  });
                                });
                              });
                            });
                          },
                        );
                      },
                    );
                  },
                );
              },
            );
          },
        );
      });
    });
  });
});
