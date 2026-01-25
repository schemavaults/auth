const createOrganizationDialogContentId: string =
  "create-organization-dialog-content";
const openOrganizationCreationDialogButtonId: string =
  "open-create-organization-dialog-button";
const submitOrganizationCreationDialogButtonId: string =
  "submit-create-organization-form-button";

export interface CreateOrganizationParams {
  organization_id: string;
  name: string;
}

export default function createOrganization(
  params: CreateOrganizationParams,
): Cypress.Chainable<boolean> {
  const { organization_id, name } = params;

  if (typeof organization_id !== "string") {
    throw new TypeError("'organization_id' must be a string");
  }

  if (typeof name !== "string") {
    throw new TypeError("'name' must be a string");
  }

  return cy.is_admin().then((isAdmin) => {
    if (!isAdmin) {
      throw new Error(
        "Cannot create organization: current user is not an admin.",
      );
    }

    return cy.visit("/admin/organizations").then(() => {
      cy.url().should("include", "/admin/organizations");

      return cy
        .open_dialog_with_button(
          openOrganizationCreationDialogButtonId,
          createOrganizationDialogContentId,
        )
        .then(() => {
          cy.url({ log: false }).should("include", "/admin/organizations");

          // Fill out form within new dialog
          cy.get(`input[name="organization_id"]`, { log: false })
            .should("exist")
            .should("be.visible")
            .should("not.be.disabled")
            .type(organization_id, { force: true });

          cy.get(`input[name="name"]`, { log: false })
            .should("exist")
            .should("be.visible")
            .should("not.be.disabled")
            .type(name, { force: true });

          cy.url({ log: false }).should("include", "/admin/organizations");

          // Submit form
          cy.intercept({
            method: "POST",
            url: "**/api/organizations",
            times: 1,
          }).as("createOrganizationRequest");
          cy.get(`button#${submitOrganizationCreationDialogButtonId}`, {
            log: false,
          })
            .should("exist")
            .should("not.be.disabled")
            .click();

          return cy
            .wait("@createOrganizationRequest", { timeout: 20000 })
            .then((interception) => {
              interception.response?.statusCode &&
                cy.wrap(interception.response?.statusCode).should("eq", 200);
              cy.log(
                "Organization creation request appears to have been a success!",
              );
              cy.get(`#${createOrganizationDialogContentId}`, {
                log: false,
              }).should("not.exist");
              return cy.wrap(true, { log: false });
            })
            .then((val): boolean => {
              if (typeof val === "boolean") return val;
              return val[0];
            });
        });
    });
  });
}
