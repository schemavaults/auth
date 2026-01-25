export default function open_dialog_with_button(
  // Button to click to open the dialog
  open_dialog_button_id: string,
  // Selector to ensure that the dialog opened successfully
  dialog_content_container_id: string,
): Cypress.Chainable<JQuery<HTMLElement>> {
  if (typeof open_dialog_button_id !== "string") {
    throw new TypeError("Expected 'open_dialog_button_id' to be a string!");
  } else if (typeof dialog_content_container_id !== "string") {
    throw new TypeError(
      "Expected 'dialog_content_container_id' to be a string!",
    );
  }

  if (
    open_dialog_button_id.startsWith("#") ||
    dialog_content_container_id.startsWith("#")
  ) {
    throw new TypeError(
      "[open_dialog_with_button] Pass IDs without leading # character",
    );
  }

  cy.log(
    `Attempting to open dialog (with content container ID '${dialog_content_container_id}') by clicking on button with ID '${open_dialog_button_id}'`,
  );

  // Dialog should not be open when starting
  cy.get(`#${dialog_content_container_id}`, { log: false }).should("not.exist");

  // Retry clicking until the dialog opens (handles hydration timing)
  const maxAttempts: number = 10;
  const clickUntilDialogOpens = (attempt = 1): void => {
    cy.get(`button#${open_dialog_button_id}`).should("exist").scrollIntoView();

    cy.get(`button#${open_dialog_button_id}`)
      .should("be.visible")
      .should("not.be.disabled")
      .then(($button) => {
        $button[0].click();
      });
    cy.wait(500);
    cy.get("body").then(($body) => {
      if ($body.find(`#${dialog_content_container_id}`).is(":visible")) {
        return; // Dialog opened, success
      }
      if (attempt >= maxAttempts) {
        throw new Error(`Dialog did not open after ${maxAttempts} attempts`);
      }
      clickUntilDialogOpens(attempt + 1);
    });
  };
  clickUntilDialogOpens();

  return cy
    .get(`#${dialog_content_container_id}`, { log: false })
    .should("exist")
    .should("be.visible")
    .then((ele: JQuery<HTMLElement>) => {
      const firstElement = ele[0];
      return firstElement;
    });
}
