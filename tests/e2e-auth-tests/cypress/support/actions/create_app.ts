const createAppDialogContentId: string = "create-app-dialog-content";
const openCreateAppDialogButtonId: string = "open-create-app-dialog-button";
const submitCreateAppDialogButtonId: string = "submit-create-app-form-button";

export interface CreateAppParams {
  app_name: string;
  app_description: string;
  public?: boolean;
  organization_id?: string;
}

export default function createApp(
  params: CreateAppParams,
): Cypress.Chainable<boolean> {
  const { app_name, app_description, organization_id } = params;
  const isPublic = params.public ?? false;

  if (typeof app_name !== "string") {
    throw new TypeError("'app_name' must be a string");
  }

  if (typeof app_description !== "string") {
    throw new TypeError("'app_description' must be a string");
  }

  // Navigate to the appropriate page based on whether organization_id is provided
  const targetUrl = organization_id
    ? `/org/${organization_id}`
    : "/admin/apps";

  return cy.visit(targetUrl).then(() => {
    cy.url().should("include", targetUrl);

    cy.get(`#${createAppDialogContentId}`, { log: false }).should("not.exist");

    // Allow hydration before clicking on button
    cy.wait(2000);

    cy.get(`button#${openCreateAppDialogButtonId}`)
      .should("exist")
      .click();

    // Wait for dialog animation
    cy.wait(750);

    cy.get(`#${createAppDialogContentId}`, { log: false }).should("be.visible");
    cy.url({ log: false }).should("include", targetUrl);

    // Fill out form within new dialog
    cy.get(`input[name="app_name"]`, { log: false })
      .should("exist")
      .should("be.visible")
      .should("not.be.disabled")
      .clear()
      .type(app_name, { force: true });

    cy.get(`textarea[name="app_description"]`, { log: false })
      .should("exist")
      .should("be.visible")
      .should("not.be.disabled")
      .clear()
      .type(app_description, { force: true });

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
      url: "**/api/apps",
      times: 1,
    }).as("createAppRequest");
    cy.get(`button#${submitCreateAppDialogButtonId}`, {
      log: false,
    })
      .should("exist")
      .should("not.be.disabled")
      .click();

    return cy
      .wait("@createAppRequest", { timeout: 20000 })
      .then((interception) => {
        interception.response?.statusCode &&
          cy.wrap(interception.response?.statusCode).should("eq", 200);
        cy.log("App creation request appears to have been a success!");
        cy.get(`#${createAppDialogContentId}`, {
          log: false,
        }).should("not.exist");
        return cy.wrap(true, { log: false });
      })
      .then((val: JQuery<boolean>): boolean => {
        return typeof val === "boolean" ? val : val[0];
      });
  });
}
