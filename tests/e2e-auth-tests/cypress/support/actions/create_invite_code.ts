const createInviteCodeDialogContentId: string =
  "create-invite-code-dialog-content";
const openInviteCodeCreationDialogButtonId: string =
  "open-create-invite-code-dialog-button";
const submitInviteCodeCreationDialogButtonId: string =
  "submit-create-invite-code-form-button";

export default function createInviteCode(
  invite_code: string,
  max_uses: number,
): Cypress.Chainable<boolean> {
  if (typeof invite_code !== "string") {
    throw new TypeError("'invite_code' must be a string");
  }

  if (typeof max_uses !== "number") {
    throw new TypeError("'max_uses' must be a number");
  }

  return cy.is_admin().then((isAdmin) => {
    if (!isAdmin) {
      throw new Error(
        "Cannot create invite code: current user is not an admin.",
      );
    }

    return cy.visit("/admin/invite_codes").then(() => {
      cy.url().should("include", "/admin/invite_codes");

      cy.get(`#${createInviteCodeDialogContentId}`, { log: false }).should(
        "not.exist",
      );

      return cy
        .open_dialog_with_button(
          openInviteCodeCreationDialogButtonId,
          createInviteCodeDialogContentId,
        )
        .then(() => {
          cy.url({ log: false }).should("include", "/admin/invite_codes");

          // Fill out form within new dialog
          cy.get(`input[name="invite_code"]`, { log: false })
            .should("exist")
            .should("not.be.disabled")
            .type(invite_code);

          cy.get(`textarea[name="description"]`, { log: false })
            .should("exist")
            .should("not.be.disabled")
            .type("Invite code generated within Cypress E2E test", {
              force: true,
            });

          cy.url({ log: false }).should("include", "/admin/invite_codes");

          cy.get(`input[name="max_uses"]`, { log: false })
            .should("exist")
            .should("not.be.disabled")
            .type(`{selectAll}${max_uses.toString()}`);

          cy.log("Invite code form should be finished getting filled by now.");
          cy.get(`input[name="invite_code"]`, { log: false })
            .should("exist")
            .should("have.value", invite_code);

          // Submit form
          cy.intercept({
            method: "POST",
            url: "**/api/admin/invite-codes",
            times: 1,
          }).as("createInviteCodeRequest");
          cy.get(`button#${submitInviteCodeCreationDialogButtonId}`, {
            log: false,
          })
            .should("exist")
            .should("not.be.disabled")
            .click();
          cy.log("Create invite code form submitted!");
          cy.log_active_toasts();

          return cy
            .wait("@createInviteCodeRequest", { timeout: 20000 })
            .then((interception) => {
              interception.response?.statusCode &&
                cy.wrap(interception.response?.statusCode).should("eq", 200);
              cy.log(
                "Invite code creation request appears to have been a success!",
              );
              cy.get(`#${createInviteCodeDialogContentId}`, {
                log: false,
              }).should("not.exist");
              return cy.wrap(true, { log: false });
            })
            .then((val: boolean): boolean => {
              return typeof val === "boolean" ? val : val[0];
            });
        });
    });
  });
}

export function createInviteCodeAsAdmin(
  invite_code: string,
  max_uses: number,
): Cypress.Chainable<boolean> {
  return cy.as_admin(() => {
    return createInviteCode(invite_code, max_uses);
  });
}
