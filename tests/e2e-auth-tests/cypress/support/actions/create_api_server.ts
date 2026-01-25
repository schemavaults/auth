const createApiServerDialogContentId: string =
  "create-api-server-dialog-content";
const openCreateApiServerDialogButtonId: string =
  "open-create-api-server-dialog-button";
const submitCreateApiServerDialogButtonId: string =
  "submit-create-api-server-form-button";

export interface CreateApiServerParams {
  api_server_name: string;
  api_server_description: string;
  public?: boolean;
  organization_id?: string;
}

export default function createApiServer(
  params: CreateApiServerParams,
): Cypress.Chainable<boolean> {
  const { api_server_name, api_server_description, organization_id } = params;
  const isPublic = params.public ?? false;

  if (typeof api_server_name !== "string") {
    throw new TypeError("'api_server_name' must be a string");
  }

  if (typeof api_server_description !== "string") {
    throw new TypeError("'api_server_description' must be a string");
  }

  // Navigate to the appropriate page based on whether organization_id is provided
  const targetUrl = organization_id ? `/org/${organization_id}` : "/admin/apis";

  return cy.visit(targetUrl).then(() => {
    cy.url().should("include", targetUrl);

    return cy
      .open_dialog_with_button(
        openCreateApiServerDialogButtonId,
        createApiServerDialogContentId,
      )
      .then(() => {
        cy.url({ log: false }).should("include", targetUrl);

        // Fill out form within new dialog
        cy.get(`input[name="api_server_name"]`, { log: false })
          .should("exist")
          .should("be.visible")
          .should("not.be.disabled")
          .type(api_server_name, { force: true });

        cy.get(`textarea[name="api_server_description"]`, { log: false })
          .should("exist")
          .should("be.visible")
          .should("not.be.disabled")
          .type(api_server_description, { force: true });

        // Toggle public checkbox if requested
        if (isPublic) {
          cy.get(`button[role="checkbox"][name="public"]`, { log: false })
            .should("exist")
            .click();
        }

        cy.url({ log: false }).should("include", targetUrl);

        // Submit form
        cy.intercept({
          method: "POST",
          url: "**/api/apis",
          times: 1,
        }).as("createApiServerRequest");
        cy.get(`button#${submitCreateApiServerDialogButtonId}`, {
          log: false,
        })
          .should("exist")
          .should("not.be.disabled")
          .click();

        cy.log("Create API server dialog submitted!");

        cy.wait(2000);

        return cy
          .wait("@createApiServerRequest", { timeout: 20000 })
          .then((interception) => {
            interception.response?.statusCode &&
              cy.wrap(interception.response?.statusCode).should("eq", 200);
            cy.log(
              "API server creation request appears to have been a success!",
            );
            cy.get(`#${createApiServerDialogContentId}`, {
              log: false,
            }).should("not.exist");
            return cy.wrap(true, { log: false });
          })
          .then((val): boolean => {
            return typeof val === "boolean" ? val : val[0];
          });
      });
  });
}
