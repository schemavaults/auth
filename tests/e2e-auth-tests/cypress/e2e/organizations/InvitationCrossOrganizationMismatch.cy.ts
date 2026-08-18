// Verifies the cross-organization mismatch guard on
// PATCH /api/organizations/:organization_id/invitations/:invitation_id.
//
// A pending invitation for organization B must NOT be respondable via a URL
// whose :organization_id path segment refers to a different organization A —
// even when the caller is the legitimate invitee of the underlying invitation.
// If the server accepted the request against the wrong-org URL, an attacker
// who tricked an invitee into visiting a crafted link (`/orgA/.../<invitation
// belonging to orgB>`) could sneak the invitee into an organization they
// never intended to join, or side-step the org-scoped audit trail.
//
// The relevant check lives in `PATCH_respond_to_invitation_handler` in
// auth-server/src/app/api/organizations/[organization_id]/invitations/
// [invitation_id]/route.ts:
//
//   if (invitation.organization_id !== organization_id) {
//     ... 404 "Invitation does not belong to this organization" ...
//   }
//
// Existing coverage:
//   - 401 (unauthenticated PATCH invitations) is covered by
//     misc/UnauthenticatedApiRequests.cy.ts.
//   - 403 (authenticated non-invitee) is covered by
//     organizations/InvitationAuthorization.cy.ts.
//   - 404 (wrong-organization-id-in-URL) was not previously exercised.

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

interface ListOrganizationInvitationsResponseBody {
  success: boolean;
  data?: {
    invitations: Array<{
      invitation_id: string;
      status: string;
    }>;
  };
}

interface MyOrganizationsResponseBody {
  success: boolean;
  data?: {
    organizations: Array<{ organization_id: string }>;
  };
}

// Module marker: keeps this spec's top-level interfaces file-scoped so they
// do not collide with same-named interfaces in other spec files.
export {};

describe("Invitation cross-organization mismatch", () => {
  it("PATCH /api/organizations/:wrong_org/invitations/:id returns 404 when the invitation belongs to a different organization", () => {
    cy.generate_random_code(12).then((randomCode: string) => {
      const lowerCode = randomCode.toLowerCase();
      const owning_organization_id = `inv-xorg-b-${lowerCode}`;
      const owning_name = `Invitation X-Org Owner ${randomCode}`;
      const decoy_organization_id = `inv-xorg-a-${lowerCode}`;
      const decoy_name = `Invitation X-Org Decoy ${randomCode}`;

      cy.generate_random_test_user_credentials().then((inviteeCredentials) => {
        // 1. Pre-create the invitee account so the invitation lookup succeeds
        //    (the invitations resource resolves invitees by email → uid).
        cy.create_and_login_as_regular_user_via_request(inviteeCredentials).then(
          (createdInvitee: boolean) => {
            if (!createdInvitee) {
              throw new Error("Failed to create invitee user");
            }
            cy.logout();

            // 2. Become the superuser (owner of both organizations) and
            //    create BOTH the owning and the decoy organization.
            cy.create_and_login_as_superuser_via_request().then(
              (suSuccess: boolean) => {
                if (!suSuccess) {
                  throw new Error("Failed to login as superuser");
                }

                cy.create_organization_via_request({
                  organization_id: owning_organization_id,
                  name: owning_name,
                }).then(() => {
                  cy.create_organization_via_request({
                    organization_id: decoy_organization_id,
                    name: decoy_name,
                  }).then(() => {
                    // 3. Issue a pending invitation for the invitee against
                    //    the OWNING organization only. The decoy organization
                    //    intentionally has no invitation for this user.
                    cy.request<CreateInvitationResponseBody>({
                      method: "POST",
                      url: `/api/organizations/${owning_organization_id}/invitations`,
                      body: {
                        input_mode: "email",
                        identifier: inviteeCredentials.email,
                      },
                    }).then((createInvitationResponse) => {
                      expect(createInvitationResponse.status).to.eq(201);
                      expect(createInvitationResponse.body.success).to.eq(true);
                      const invitation_id =
                        createInvitationResponse.body.data?.invitation
                          .invitation_id;
                      if (!invitation_id) {
                        throw new Error(
                          "Expected the create-invitation response to include an invitation_id",
                        );
                      }
                      expect(
                        createInvitationResponse.body.data?.invitation
                          .organization_id,
                        "invitation must actually belong to the owning organization",
                      ).to.eq(owning_organization_id);

                      // 4. Log the superuser out, log in as the invitee (the
                      //    legitimate holder of this invitation) and attempt
                      //    to accept via the DECOY organization's URL. The
                      //    server must refuse with 404 rather than silently
                      //    consuming the invitation.
                      cy.logout();
                      cy.login_via_request(
                        inviteeCredentials.email,
                        inviteeCredentials.password,
                      ).then((inviteeLoggedIn: boolean) => {
                        if (!inviteeLoggedIn) {
                          throw new Error("Failed to login as invitee user");
                        }

                        cy.request({
                          method: "PATCH",
                          url: `/api/organizations/${decoy_organization_id}/invitations/${invitation_id}`,
                          failOnStatusCode: false,
                          body: { action: "accept" },
                        }).then((patchResponse) => {
                          expect(
                            patchResponse.status,
                            "wrong-org PATCH must not succeed",
                          ).to.eq(404);
                          expect(patchResponse.body).to.have.property(
                            "success",
                            false,
                          );
                          expect(
                            String(patchResponse.body.message).toLowerCase(),
                            "response should explain the invitation does not belong to the URL organization",
                          ).to.include("does not belong to this organization");
                        });

                        // 5. Side-effect assertions: the invitee must not have
                        //    become a member of either organization as a
                        //    consequence of the rejected PATCH.
                        cy.request<MyOrganizationsResponseBody>({
                          method: "GET",
                          url: "/api/me/organizations",
                        }).then((meOrgsResponse) => {
                          expect(meOrgsResponse.status).to.eq(200);
                          const memberOrgIds = (
                            meOrgsResponse.body.data?.organizations ?? []
                          ).map((o) => o.organization_id);
                          expect(memberOrgIds).to.not.include(
                            owning_organization_id,
                          );
                          expect(memberOrgIds).to.not.include(
                            decoy_organization_id,
                          );
                        });

                        // 6. And the invitation on the owning organization
                        //    must still be pending — the rejected wrong-org
                        //    PATCH must not have consumed it.
                        cy.logout();
                        cy.create_and_login_as_superuser_via_request().then(
                          () => {
                            cy.request<ListOrganizationInvitationsResponseBody>(
                              {
                                method: "GET",
                                url: `/api/organizations/${owning_organization_id}/invitations`,
                              },
                            ).then((listResponse) => {
                              expect(listResponse.status).to.eq(200);
                              const invitations =
                                listResponse.body.data?.invitations ?? [];
                              const stillPending = invitations.find(
                                (inv) => inv.invitation_id === invitation_id,
                              );
                              if (!stillPending) {
                                throw new Error(
                                  "Expected the owning invitation to remain after the rejected wrong-org PATCH",
                                );
                              }
                              expect(stillPending.status).to.eq("pending");
                            });

                            // 7. Cleanup - delete both organizations.
                            cy.delete_organization({
                              organization_id: owning_organization_id,
                            });
                            cy.delete_organization({
                              organization_id: decoy_organization_id,
                            });
                          },
                        );
                      });
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
