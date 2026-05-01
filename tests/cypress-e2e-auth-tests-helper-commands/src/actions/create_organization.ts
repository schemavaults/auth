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
      return cy.wait_for_page_hydration().then(() => {
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
              .should("not.be.disabled")
              .type(organization_id);

            cy.log(`Finished typing organization ID "${organization_id}"`);

            cy.get(`input[name="name"]`, { log: false })
              .should("exist")
              .should("not.be.disabled")
              .type(name);

            cy.log(`Finished typing organization name "${name}"`);

            // Form should now be filled-- validate state before submitting
            cy.get(`#${createOrganizationDialogContentId}`, {
              log: false,
            }).should("exist");
            cy.url({ log: false }).should("include", "/admin/organizations");

            // Validate organization ID was filled correctly
            cy.get(`input[name="organization_id"]`, { log: false }).should(
              "have.value",
              organization_id,
            );

            // Validate organization name was filled correctly
            cy.get(`input[name="name"]`, { log: false }).should(
              "have.value",
              name,
            );

            // Set up interception for org creation request
            cy.intercept({
              method: "POST",
              url: "**/api/organizations",
              times: 1,
            }).as("createOrganizationRequest");

            cy.log("Interceptor prepared. Clicking on submit button.");

            // Click on submit button
            cy.get(`button#${submitOrganizationCreationDialogButtonId}`, {
              log: false,
            })
              .should("exist")
              .should("not.be.disabled")
              .click();

            cy.log("Create organization form submitted!");
            cy.has_error_toast().then((error: boolean) => {
              if (error) {
                cy.log_active_toasts();
              }
            });

            return cy
              .wait("@createOrganizationRequest", {
                timeout: 20000,
                requestTimeout: 20000,
              })
              .then((interception) => {
                interception.response?.statusCode &&
                  cy
                    .wrap(interception.response?.statusCode)
                    .should(
                      "eq",
                      200,
                      "Create organization API request should return 200",
                    );
                cy.log(
                  `Organization creation request (for org with ID '${organization_id}' and name '${name}') appears to have been a success!`,
                );
                cy.wait(150);
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
  });
}
