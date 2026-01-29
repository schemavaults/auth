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

export interface CreateApiServerResult {
  success: boolean;
  api_server_id: string | null;
}

export default function createApiServer(
  params: CreateApiServerParams,
): Cypress.Chainable<CreateApiServerResult> {
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
    cy.wait_for_page_hydration();

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
          .should("not.be.disabled")
          .type(api_server_name);

        cy.get(`textarea[name="api_server_description"]`, { log: false })
          .should("exist")
          .should("not.be.disabled")
          .type(api_server_description);

        // Toggle public checkbox if requested
        if (isPublic) {
          cy.get(`button[role="checkbox"][name="public"]`, { log: false })
            .should("exist")
            .click();
        }

        cy.url({ log: false }).should("include", targetUrl);

        cy.intercept({
          method: "POST",
          url: "**/api/apis",
          times: 1,
        }).as("createApiServerRequest");

        // Submit form
        cy.get(`button#${submitCreateApiServerDialogButtonId}`, {
          log: false,
        })
          .should("exist")
          .should("not.be.disabled")
          .click();

        cy.log("Create API server dialog submitted!");

        cy.has_error_toast().then((error: boolean) => {
          if (error) {
            cy.log_active_toasts();
            throw new Error(
              "Received error toast after create API server dialog submission!",
            );
          }
        });

        return cy
          .wait("@createApiServerRequest", {
            timeout: 20000,
            requestTimeout: 20000,
          })
          .then((interception) => {
            const statusCode = interception.response?.statusCode;
            const responseBody = interception.response?.body;
            const success = statusCode === 200;
            const api_server_id = responseBody?.resource_id ?? null;

            if (success) {
              cy.wrap(statusCode).should("eq", 200);
              cy.log(
                "API server creation request appears to have been a success!",
              );
            }

            cy.get(`#${createApiServerDialogContentId}`, {
              log: false,
            }).should("not.exist");

            return cy.wrap({ success, api_server_id }, { log: false });
          });
      });
  });
}
