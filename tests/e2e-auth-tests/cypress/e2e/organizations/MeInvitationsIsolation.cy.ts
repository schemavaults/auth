// Verifies that GET /api/me/invitations only returns invitations whose
// invitee_uid matches the authenticated caller. The handler
// (auth-server/src/app/api/me/invitations/route.ts) delegates to
// listUserPendingInvitations() which filters rows by `invitee_uid = uid`,
// `status = "pending"` and `expires_at > now`. If that filter ever
// regressed — e.g. a JOIN dropped the predicate, or the route stopped
// scoping by `user.uid` — a logged-in user would see invitations
// addressed to other accounts, which is a meaningful information-leak.
//
// The unauthenticated (401) case for this endpoint is already covered by
// misc/UnauthenticatedApiRequests.cy.ts. The invitee-only PATCH guard for
// accepting an invitation is covered by InvitationAuthorization.cy.ts.
// The listing endpoint itself had no direct E2E coverage.

interface MeInvitationsResponseBody {
  success: boolean;
  message?: string;
  data?: {
    invitations: Array<{
      invitation_id: string;
      organization_id: string;
      organization_name: string;
      inviter_uid: string;
      inviter_email: string;
      status: string;
      created_at: number;
      expires_at: number;
    }>;
  };
}

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

// Module marker: keeps this spec's top-level interfaces file-scoped so they
// do not collide with same-named interfaces in other spec files.
export {};

describe("GET /api/me/invitations isolation", () => {
  it("returns the invitation to the invitee but not to a different authenticated user", () => {
    cy.generate_random_code(12).then((randomCode: string) => {
      const organization_id = `me-inv-iso-${randomCode.toLowerCase()}`;
      const name = `Me Invitations Isolation Org ${randomCode}`;

      cy.generate_random_test_user_credentials().then((inviteeCredentials) => {
        cy.generate_random_test_user_credentials().then((bystanderCredentials) => {
          // 1. Create the invitee account so the invitation lookup-by-email
          //    can resolve a uid.
          cy.create_and_login_as_regular_user_via_request(inviteeCredentials).then(
            (createdInvitee: boolean) => {
              expect(createdInvitee, "invitee registration should succeed").to.be
                .true;
              cy.logout();

              // 2. Create an unrelated bystander account. They should never
              //    see the invitee's invitation.
              cy.create_and_login_as_regular_user_via_request(
                bystanderCredentials,
              ).then((createdBystander: boolean) => {
                expect(
                  createdBystander,
                  "bystander registration should succeed",
                ).to.be.true;
                cy.logout();

                // 3. Log in as superuser, create the org, issue the invitation
                //    for the invitee.
                cy.create_and_login_as_superuser_via_request().then(
                  (suSuccess: boolean) => {
                    expect(suSuccess, "superuser login should succeed").to.be
                      .true;

                    cy.create_organization_via_request({
                      organization_id,
                      name,
                    }).then(() => {
                      cy.request<CreateInvitationResponseBody>({
                        method: "POST",
                        url: `/api/organizations/${organization_id}/invitations`,
                        body: {
                          input_mode: "email",
                          identifier: inviteeCredentials.email,
                        },
                      }).then((createInvitationResponse) => {
                        expect(createInvitationResponse.status).to.eq(201);
                        expect(createInvitationResponse.body.success).to.eq(
                          true,
                        );
                        const invitation_id =
                          createInvitationResponse.body.data?.invitation
                            .invitation_id;
                        if (!invitation_id) {
                          throw new Error(
                            "Expected the create-invitation response to include an invitation_id",
                          );
                        }

                        // 4. Log in as the invitee and confirm GET
                        //    /api/me/invitations contains exactly that
                        //    invitation, scoped to this org.
                        cy.logout();
                        cy.login_via_request(
                          inviteeCredentials.email,
                          inviteeCredentials.password,
                        ).then((inviteeLoggedIn: boolean) => {
                          expect(
                            inviteeLoggedIn,
                            "invitee login should succeed",
                          ).to.be.true;

                          cy.request<MeInvitationsResponseBody>({
                            method: "GET",
                            url: "/api/me/invitations",
                          }).then((inviteeResponse) => {
                            expect(inviteeResponse.status).to.eq(200);
                            expect(inviteeResponse.body.success).to.eq(true);
                            const inviteeInvitations =
                              inviteeResponse.body.data?.invitations ?? [];
                            const matching = inviteeInvitations.filter(
                              (inv) =>
                                inv.invitation_id === invitation_id &&
                                inv.organization_id === organization_id,
                            );
                            expect(
                              matching.length,
                              "invitee should see the pending invitation issued for them",
                            ).to.equal(1);
                            expect(matching[0]?.status).to.equal("pending");
                          });
                        });

                        // 5. Log in as the unrelated bystander and confirm
                        //    they do NOT see the invitee's invitation in
                        //    their own pending-invitations list. This is the
                        //    core isolation assertion.
                        cy.logout();
                        cy.login_via_request(
                          bystanderCredentials.email,
                          bystanderCredentials.password,
                        ).then((bystanderLoggedIn: boolean) => {
                          expect(
                            bystanderLoggedIn,
                            "bystander login should succeed",
                          ).to.be.true;

                          cy.request<MeInvitationsResponseBody>({
                            method: "GET",
                            url: "/api/me/invitations",
                          }).then((bystanderResponse) => {
                            expect(bystanderResponse.status).to.eq(200);
                            expect(bystanderResponse.body.success).to.eq(true);
                            const bystanderInvitations =
                              bystanderResponse.body.data?.invitations ?? [];
                            const leaked = bystanderInvitations.filter(
                              (inv) =>
                                inv.invitation_id === invitation_id ||
                                inv.organization_id === organization_id,
                            );
                            expect(
                              leaked.length,
                              "bystander must not see another user's pending invitation",
                            ).to.equal(0);
                          });
                        });

                        // 6. Cleanup — delete the org as superuser.
                        cy.logout();
                        cy.create_and_login_as_superuser_via_request().then(
                          () => {
                            cy.delete_organization({ organization_id });
                          },
                        );
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
  });
});
