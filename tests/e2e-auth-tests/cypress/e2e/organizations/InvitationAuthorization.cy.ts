// Verifies the auth-server enforces invitee-only authorization on
// PATCH /api/organizations/:organization_id/invitations/:invitation_id.
//
// A user who is NOT the invitee on a pending organization invitation must
// receive a 403 response when attempting to accept it, and must NOT become
// a member of the organization as a side effect.
//
// See `PATCH_respond_to_invitation_handler` in
// auth-server/src/app/api/organizations/[organization_id]/invitations/[invitation_id]/route.ts.

interface CreateInvitationResponseBody {
  success: boolean;
  message: string;
  data?: {
    invitation: {
      invitation_id: string;
      organization_id: string;
      invitee_uid: string;
    };
  };
}

interface MyOrganizationsResponseBody {
  success: boolean;
  data?: {
    organizations: Array<{ organization_id: string }>;
  };
}

describe("Invitation Authorization", () => {
  it("non-invitee user cannot accept another user's pending invitation (403)", () => {
    cy.generate_random_code(12).then((randomCode: string) => {
      const organization_id = `inv-auth-${randomCode.toLowerCase()}`;
      const name = `Invitation Auth Test Org ${randomCode}`;

      // Generate credentials for both users up-front so we can reference them
      // across the nested login/logout flow.
      cy.generate_random_test_user_credentials().then((inviteeCredentials) => {
        cy.generate_random_test_user_credentials().then((attackerCredentials) => {
          // 1. Create the invitee account (regular user, not in the org).
          cy.create_and_login_as_regular_user_via_request(inviteeCredentials).then(
            (createdInvitee: boolean) => {
              if (!createdInvitee) {
                throw new Error("Failed to create invitee user");
              }
              cy.logout();

              // 2. Create the attacker account (regular user, not in the org).
              cy.create_and_login_as_regular_user_via_request(attackerCredentials).then(
                (createdAttacker: boolean) => {
                  if (!createdAttacker) {
                    throw new Error("Failed to create attacker user");
                  }
                  cy.logout();

                  // 3. Login as superuser, create the org, then issue an
                  // invitation for the invitee via API.
                  cy.create_and_login_as_superuser_via_request().then((suSuccess: boolean) => {
                    if (!suSuccess) {
                      throw new Error("Failed to login as superuser");
                    }

                    cy.create_organization_via_request({ organization_id, name }).then(() => {
                      cy.request<CreateInvitationResponseBody>({
                        method: "POST",
                        url: `/api/organizations/${organization_id}/invitations`,
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

                        // 4. Logout the superuser, log in as the attacker,
                        // and attempt to accept the invitation that belongs
                        // to the invitee.
                        cy.logout();
                        cy.login_via_request(
                          attackerCredentials.email,
                          attackerCredentials.password,
                        ).then((attackerLoggedIn: boolean) => {
                          if (!attackerLoggedIn) {
                            throw new Error("Failed to login as attacker user");
                          }

                          cy.request({
                            method: "PATCH",
                            url: `/api/organizations/${organization_id}/invitations/${invitation_id}`,
                            failOnStatusCode: false,
                            body: { action: "accept" },
                          }).then((patchResponse) => {
                            expect(patchResponse.status).to.eq(403);
                            expect(patchResponse.body).to.have.property(
                              "success",
                              false,
                            );
                            expect(
                              String(patchResponse.body.message).toLowerCase(),
                            ).to.include("not authorized");
                          });

                          // 5. Verify the attacker did NOT become a member
                          // of the organization as a side effect.
                          cy.request<MyOrganizationsResponseBody>({
                            method: "GET",
                            url: "/api/me/organizations",
                          }).then((meOrgsResponse) => {
                            expect(meOrgsResponse.status).to.eq(200);
                            const memberOrgIds = (
                              meOrgsResponse.body.data?.organizations ?? []
                            ).map((o) => o.organization_id);
                            expect(memberOrgIds).to.not.include(organization_id);
                          });

                          // 6. Cleanup - log back in as superuser and delete the org.
                          cy.logout();
                          cy.create_and_login_as_superuser_via_request().then(() => {
                            cy.delete_organization({ organization_id });
                          });
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
});
