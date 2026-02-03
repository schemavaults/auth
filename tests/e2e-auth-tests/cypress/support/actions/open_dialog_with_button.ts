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
    cy.wait(200);
    cy.get("body").then(($body) => {
      const selector: string = `#${dialog_content_container_id}`;
      const dialogContent: JQuery<HTMLBodyElement> = $body.find(selector);
      if (dialogContent.length > 0) {
        if (dialogContent.is(":visible")) {
          cy.log("Dialog content appears to meet :visible selector! Ready!");
          return; // Dialog opened, success
        } else if (dialogContent.is('[data-state="open"]')) {
          cy.log(
            'Dialog content appears to meet data-state="open" selector! Ready!',
          );
          return;
        } else {
          cy.log(
            `Found ${dialogContent.length} elements with query for ${selector} but none appear to be marked as open for test selector!`,
          );
        }
      } else {
        cy.log(
          `Failed to find selector '${selector}' in DOM (attempt ${attempt}/${maxAttempts})`,
        );
      }
      if (attempt >= maxAttempts) {
        cy.log(
          `Dialog did not open after ${maxAttempts} attempts! Throwing error...`,
        );
        throw new Error(`Dialog did not open after ${maxAttempts} attempts`);
      }
      clickUntilDialogOpens(attempt + 1);
    });
  };
  clickUntilDialogOpens();

  return cy
    .get(`#${dialog_content_container_id}`, { log: false })
    .should("exist")
    .then((ele: JQuery<HTMLElement>) => {
      const firstElement = ele[0];
      return firstElement;
    });
}
