
const openInviteCodeCreationDialogButtonId: string = "open-create-invite-code-dialog-button";
const submitInviteCodeCreationDialogButtonId: string = "submit-create-invite-code-form-button";

export default function createInviteCode(invite_code: string, max_uses: number): Cypress.Chainable<boolean> {
  if (typeof invite_code !== 'string') {
    throw new TypeError("'invite_code' must be a string");
  }

  if (typeof max_uses !== 'number') {
    throw new TypeError("'max_uses' must be a number");
  }
  
  return cy.is_admin().then((isAdmin) => {
    if (!isAdmin) {
      throw new Error("Cannot create invite code: current user is not an admin.");
    }

    return cy.visit("/admin/invite_codes").then(() => {
      cy.url().should("include", "/admin/invite_codes");

      cy.get(`button#${openInviteCodeCreationDialogButtonId}`).click();

      // Fill out form within new dialog
      cy.get("input[name='invite_code']", { log: false })
        .should("exist")
        .should('be.visible')
        .should("not.be.disabled")
        .type(invite_code, { force: true });
      cy.get("input[name='description']", { log: false })
        .should("exist")
        .should("not.be.disabled")
        .type("Invite code generated within Cypress E2E test", { force: true });
      cy.get("input[name='max_uses']", { log: false })
        .should("exist")
        .should("not.be.disabled")
        .type(max_uses.toString(), { force: true });

      // Submit form
      cy.intercept("POST", "**/api/admin/invite-codes/create").as("createInviteCodeRequest");
      cy.get(`button#${submitInviteCodeCreationDialogButtonId}`, { log: false })
        .should("exist")
        .should("not.be.disabled")
        .click();

      return cy.wait("@createInviteCodeRequest", { timeout: 10000 }).then((interception) => {
        interception.response?.statusCode && cy.wrap(interception.response?.statusCode).should("eq", 200);
        cy.log("Invite code creation request appears to have been a success!");
        return true;
      });
    })
  })
}
