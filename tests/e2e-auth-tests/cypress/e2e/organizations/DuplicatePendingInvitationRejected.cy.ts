// Verifies that POST /api/organizations/:organization_id/invitations returns
// 409 when an owner attempts to invite the same user twice while the first
// invitation is still pending. This guard lives in
// auth-server/src/app/api/organizations/[organization_id]/invitations/route.ts
// (the `existingInvitation` short-circuit, ~lines 148–159) and exists to
// prevent owners from accidentally spamming an invitee with duplicate
// invitation emails for the same organization.
//
// The unauthenticated (401), forbidden (403) and authorization (the
// invitee-only PATCH guard) cases are already covered elsewhere; the
// duplicate-pending-invitation (409) edge case had no coverage.

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

describe("Duplicate pending invitation rejected", () => {
  it("POST /api/organizations/:organization_id/invitations returns 409 when an invitation is already pending for the invitee", () => {
    cy.generate_random_code(12).then((randomCode: string) => {
      const organization_id = `dup-inv-${randomCode.toLowerCase()}`;
      const name = `Duplicate Invitation Test Org ${randomCode}`;

      cy.generate_random_test_user_credentials().then((inviteeCredentials) => {
        // 1. Create the invitee account so the invitation lookup succeeds.
        cy.create_and_login_as_regular_user_via_request(inviteeCredentials).then(
          (createdInvitee: boolean) => {
            if (!createdInvitee) {
              throw new Error("Failed to create invitee user");
            }
            cy.logout();

            // 2. Login as superuser, create the org.
            cy.create_and_login_as_superuser_via_request().then((suSuccess: boolean) => {
              if (!suSuccess) {
                throw new Error("Failed to login as superuser");
              }

              cy.create_organization({ organization_id, name }).then(() => {
                // 3. Send the first invitation — should succeed (201).
                cy.request<CreateInvitationResponseBody>({
                  method: "POST",
                  url: `/api/organizations/${organization_id}/invitations`,
                  body: {
                    input_mode: "email",
                    identifier: inviteeCredentials.email,
                  },
                  failOnStatusCode: false,
                }).then((firstResponse) => {
                  expect(
                    firstResponse.status,
                    "first invitation should succeed",
                  ).to.equal(201);
                  expect(firstResponse.body.success).to.equal(true);
                  expect(firstResponse.body.data?.invitation.status).to.equal(
                    "pending",
                  );

                  // 4. Send the duplicate invitation — this is the case
                  // under test. Server should reject with 409.
                  cy.request<CreateInvitationResponseBody>({
                    method: "POST",
                    url: `/api/organizations/${organization_id}/invitations`,
                    body: {
                      input_mode: "email",
                      identifier: inviteeCredentials.email,
                    },
                    failOnStatusCode: false,
                  }).then((duplicateResponse) => {
                    expect(
                      duplicateResponse.status,
                      "duplicate invitation should return 409",
                    ).to.equal(409);
                    expect(duplicateResponse.body).to.have.property(
                      "success",
                      false,
                    );
                    expect(
                      String(duplicateResponse.body.message).toLowerCase(),
                      "response message should reference the existing pending invitation",
                    ).to.include("already a pending invitation");
                  });

                  // 5. Cleanup — delete the org (still logged in as superuser).
                  cy.delete_organization({ organization_id });
                });
              });
            });
          },
        );
      });
    });
  });
});
