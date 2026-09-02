export interface PromoteMemberToOwnerParams {
  organization_id: string;
  user_email: string; // Email to identify row in table
}

export default function promoteMemberToOwner(
  params: PromoteMemberToOwnerParams,
): Cypress.Chainable<boolean> {
  const { organization_id, user_email } = params;

  if (typeof organization_id !== "string") {
    throw new TypeError("'organization_id' must be a string");
  }

  if (typeof user_email !== "string") {
    throw new TypeError("'user_email' must be a string");
  }

  // Navigate to the organization page
  return cy.visit(`/orgs/${organization_id}`).then(() => {
    cy.url().should("include", `/orgs/${organization_id}`);
    return cy.wait_for_page_hydration().then(() => {
      // Find the row with the user's email and click the actions menu
      cy.contains("tr", user_email)
        .should("exist")
        .within(() => {
          // Click the actions button
          cy.get('[data-testid="member-actions-button"]')
            .should("exist")
            .click();
        });

      // Intercept the role change request
      cy.intercept({
        method: "PATCH",
        url: `**/api/organizations/${organization_id}/members/*/role`,
        times: 1,
      }).as("promoteMemberRequest");

      // Wait for dropdown to open and click "Promote to Owner"
      cy.get('[data-testid="promote-to-owner-menu-item"]')
        .should("exist")
        .should("be.visible")
        .click();

      // Wait for the request to complete
      return cy
        .wait("@promoteMemberRequest", {
          timeout: 20000,
          requestTimeout: 20000,
        })
        .then((interception) => {
          const statusCode = interception.response?.statusCode ?? 500;
          const success: boolean = statusCode === 200 || statusCode === 201;

          if (success) {
            cy.log(
              `Successfully promoted user '${user_email}' to owner of organization '${organization_id}'`,
            );
            // Wait for the table to update (role should now show "owner")
            cy.contains("tr", user_email).within(() => {
              cy.contains("owner", { matchCase: false }).should("exist");
            });
          } else {
            cy.log(
              `Failed to promote user '${user_email}' to owner with status ${statusCode}`,
            );
          }

          return cy.wrap(success, { log: false });
        });
    });
  });
}
