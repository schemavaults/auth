export interface InviteAndAcceptOrgMembershipParams {
  organization_id: string;
  inviter_credentials: { email: string; password: string };
  invitee_credentials: { email: string; password: string };
}

export interface InviteAndAcceptOrgMembershipResult {
  invite_success: boolean;
  accept_success: boolean;
}

export default function inviteAndAcceptOrgMembership(
  params: InviteAndAcceptOrgMembershipParams,
): Cypress.Chainable<InviteAndAcceptOrgMembershipResult> {
  const { organization_id, inviter_credentials, invitee_credentials } = params;

  if (typeof organization_id !== "string") {
    throw new TypeError("'organization_id' must be a string");
  }

  // Step 1: Login as inviter and send invitation
  cy.login(inviter_credentials.email, inviter_credentials.password).then(
    (loginSuccess) => {
      if (!loginSuccess) {
        throw new Error(
          `Failed to login as inviter: ${inviter_credentials.email}`,
        );
      }
    },
  );

  // Navigate to organization page
  cy.visit(`/org/${organization_id}`);
  cy.url().should("include", `/org/${organization_id}`);
  cy.wait_for_page_hydration();

  // Open invite member dialog
  cy.open_dialog_with_button(
    "open-invite-member-dialog-button",
    "invite-member-dialog-content",
  );

  // Fill out email (default mode is email)
  cy.get('[data-testid="invite-member-identifier-input"]', { log: false })
    .should("exist")
    .should("not.be.disabled")
    .clear()
    .type(invitee_credentials.email);

  // Intercept the invitation API call
  cy.intercept({
    method: "POST",
    url: `**/api/organizations/${organization_id}/invitations`,
    times: 1,
  }).as("createInvitationRequest");

  // Submission should be ready. Validate that input is what is expected
  cy.get('[data-testid="invite-member-identifier-input"]', {
    log: false,
  }).should("have.value", invitee_credentials.email);

  // Submit the form
  cy.get('[data-testid="submit-invite-member-form-button"]', { log: false })
    .should("exist")
    .should("not.be.disabled")
    .click();

  cy.log("Invite member form submitted!");

  // Wait for invitation to be created
  return cy
    .wait("@createInvitationRequest", {
      timeout: 20000,
      requestTimeout: 20000,
    })
    .then(
      (interception): Cypress.Chainable<InviteAndAcceptOrgMembershipResult> => {
        const inviteStatusCode = interception.response?.statusCode ?? 500;
        const inviteSuccess = inviteStatusCode === 200;

        if (!inviteSuccess) {
          cy.log(`Failed to create invitation with status ${inviteStatusCode}`);
          return cy.wrap<InviteAndAcceptOrgMembershipResult>({
            invite_success: false,
            accept_success: false,
          });
        }

        cy.log(
          `Successfully invited ${invitee_credentials.email} to organization`,
        );

        // Dialog should close
        cy.get('[data-testid="invite-member-dialog-content"]', {
          log: false,
          timeout: 5000,
        }).should("not.exist");

        // Step 2: Logout as inviter
        cy.logout();

        // Step 3: Login as invitee
        cy.login(invitee_credentials.email, invitee_credentials.password).then(
          (inviteeLoginSuccess) => {
            if (!inviteeLoginSuccess) {
              throw new Error(
                `Failed to login as invitee: ${invitee_credentials.email}`,
              );
            }
          },
        );

        // Navigate to account page where pending invitations are shown
        cy.visit("/account");
        cy.url().should("include", "/account");
        cy.wait_for_page_hydration();

        // Set up intercept BEFORE clicking
        cy.intercept({
          method: "PATCH",
          url: `**/api/organizations/${organization_id}/invitations/*`,
          times: 1,
        }).as("acceptInvitationRequest");

        // Find and click the Accept button for the organization
        cy.contains("button", "Accept")
          .should("exist")
          .should("be.visible")
          .first()
          .click();

        return cy
          .wait("@acceptInvitationRequest", {
            timeout: 20000,
            requestTimeout: 20000,
          })
          .then(
            (
              acceptInterception,
            ): Cypress.Chainable<InviteAndAcceptOrgMembershipResult> => {
              const acceptStatusCode =
                acceptInterception.response?.statusCode ?? 500;
              const acceptSuccess = acceptStatusCode === 200;

              if (acceptSuccess) {
                cy.log(
                  `Successfully accepted invitation to ${organization_id}`,
                );
              } else {
                cy.log(
                  `Failed to accept invitation with status ${acceptStatusCode}`,
                );
              }

              return cy.wrap<InviteAndAcceptOrgMembershipResult>({
                invite_success: true,
                accept_success: acceptSuccess,
              });
            },
          );
      },
    );
}
