const createAppDialogContentId: string = "create-app-dialog-content";
const openCreateAppDialogButtonId: string = "open-create-app-dialog-button";
const submitCreateAppDialogButtonId: string = "submit-create-app-form-button";

export interface CreateAppParams {
  app_name: string;
  app_description: string;
  public?: boolean;
  organization_id?: string;
}

export interface CreateAppResult {
  success: boolean;
  app_id: string | null;
}

export default function createApp(
  params: CreateAppParams,
): Cypress.Chainable<CreateAppResult> {
  const { app_name, app_description, organization_id } = params;
  const isPublic = params.public ?? false;

  if (typeof app_name !== "string") {
    throw new TypeError("'app_name' must be a string");
  } else if (typeof app_description !== "string") {
    throw new TypeError("'app_description' must be a string");
  }

  // Navigate to the appropriate page based on whether organization_id is provided
  const targetUrl = organization_id ? `/org/${organization_id}` : "/admin/apps";

  return cy.visit(targetUrl).then(() => {
    cy.url().should("include", targetUrl);
    cy.wait_for_page_hydration();

    return cy
      .open_dialog_with_button(
        openCreateAppDialogButtonId,
        createAppDialogContentId,
      )
      .then(() => {
        cy.url({ log: false }).should("include", targetUrl);

        // Fill out form within new dialog
        cy.get(`input[name="app_name"]`, { log: false })
          .should("exist")
          .should("not.be.disabled")
          .clear()
          .type(app_name);

        cy.get(`textarea[name="app_description"]`, { log: false })
          .should("exist")
          .should("not.be.disabled")
          .clear()
          .type(app_description);

        // Toggle public checkbox if requested
        if (isPublic) {
          cy.get(`button[role="checkbox"][name="public"]`, { log: false })
            .should("exist")
            .click();
        }

        // Form should be filled out if this point was reached
        // Validate inputs before submission
        cy.url({ log: false }).should("include", targetUrl);
        cy.get(`input[name="app_name"]`, { log: false }).should(
          "have.value",
          app_name,
        );
        cy.get(`textarea[name="app_description"]`, {
          log: false,
        }).should("have.value", app_description);

        // Intercept creation request
        cy.intercept({
          method: "POST",
          url: "**/api/apps",
          times: 1,
        }).as("createAppRequest");

        // Submit form
        cy.get(`button#${submitCreateAppDialogButtonId}`, {
          log: false,
        })
          .should("exist")
          .should("not.be.disabled")
          .click();

        cy.log("Create app dialog submitted!");

        cy.has_error_toast().then((error: boolean) => {
          if (error) {
            cy.log_active_toasts();
            throw new Error(
              "Received error toast after create app dialog submission!",
            );
          }
        });

        return cy
          .wait("@createAppRequest", { timeout: 20000, requestTimeout: 20000 })
          .then((interception) => {
            const statusCode = interception.response?.statusCode;
            const responseBody = interception.response?.body;
            const success = statusCode === 200;
            const app_id = responseBody?.resource_id ?? null;

            if (success) {
              cy.wrap(statusCode).should("eq", 200);
              cy.log("App creation request appears to have been a success!");
            }

            cy.get(`#${createAppDialogContentId}`, {
              log: false,
            }).should("not.exist");

            return cy.wrap({ success, app_id }, { log: false });
          });
      });
  });
}
