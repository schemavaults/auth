const connectAppToApiDialogContentId = "connect-app-to-api-dialog-content";
const openConnectAppToApiDialogButtonId =
  "connect-app-to-api-dialog-trigger-button";

export interface ConnectAppToApiParams {
  client_app_id: string;
  api_server_id: string;
  organization_id?: string; // Navigate to /org/{id} or /admin/apis
}

export interface ConnectAppToApiResult {
  success: boolean;
  status_code: number;
}

export default function connectAppToApi(
  params: ConnectAppToApiParams,
): Cypress.Chainable<ConnectAppToApiResult> {
  const { client_app_id, api_server_id, organization_id } = params;

  if (typeof client_app_id !== "string") {
    throw new TypeError("'client_app_id' must be a string");
  }

  if (typeof api_server_id !== "string") {
    throw new TypeError("'api_server_id' must be a string");
  }

  // Navigate to the appropriate page based on whether organization_id is provided
  const targetUrl = organization_id ? `/org/${organization_id}` : "/admin/apis";

  return cy.visit(targetUrl).then(() => {
    cy.url().should("include", targetUrl);
    return cy.wait_for_page_hydration().then(() => {
      return cy
        .open_dialog_with_button(
          openConnectAppToApiDialogButtonId,
          connectAppToApiDialogContentId,
        )
        .then(() => {
          cy.url({ log: false }).should("include", targetUrl);

          // Fill out form within dialog
          cy.get(`input[name="client_app_id"]`, { log: false })
            .should("exist")
            .should("not.be.disabled")
            .clear()
            .type(client_app_id);

          // Only fill api_server_id if it's not pre-filled (check if the input is enabled)
          cy.get(`input[name="api_server_id"]`, { log: false }).then(
            ($input) => {
              if (!$input.prop("disabled") && !$input.prop("readOnly")) {
                cy.wrap($input).clear().type(api_server_id);
              }
            },
          );

          // Validate inputs before submission
          cy.get(`input[name="client_app_id"]`, { log: false }).should(
            "have.value",
            client_app_id,
          );
          cy.get(`input[name="api_server_id"]`, { log: false }).should(
            "have.value",
            api_server_id,
          );

          // Intercept the connect request
          cy.intercept({
            method: "POST",
            url: `**/api/apis/${api_server_id}/connect_app/${client_app_id}`,
            times: 1,
          }).as("connectAppToApiRequest");

          // Submit form by clicking the button containing "Connect app to API"
          cy.get(`#${connectAppToApiDialogContentId} button[type="submit"]`, {
            log: false,
          })
            .should("exist")
            .should("not.be.disabled")
            .click();

          cy.log("Connect app to API form submitted!");

          return cy
            .wait("@connectAppToApiRequest", {
              timeout: 20000,
              requestTimeout: 20000,
            })
            .then((interception) => {
              const statusCode = interception.response?.statusCode ?? 500;
              const success = statusCode === 200;

              if (success) {
                cy.log(
                  "Connect app to API request appears to have been a success!",
                );
                // Dialog should close on success
                cy.get(`#${connectAppToApiDialogContentId}`, {
                  log: false,
                  timeout: 5000,
                }).should("not.exist");
              } else {
                cy.log(
                  `Connect app to API request failed with status ${statusCode}`,
                );
              }

              return cy.wrap(
                { success, status_code: statusCode },
                { log: false },
              );
            });
        });
    });
  });
}
