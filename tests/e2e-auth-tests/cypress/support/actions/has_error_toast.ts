export default function hasErrorToast(
  containing_message?: string,
): Cypress.Chainable<boolean> {
  cy.log(
    "Attempting to find error toast" + typeof containing_message === "string"
      ? ` with message: '${containing_message}'`
      : "",
  );

  const isToastFound: Cypress.Chainable<boolean> = cy
    .get("body", { log: false })
    .then(($body): Cypress.Chainable<boolean> => {
      const $errorToasts = $body.find("li.toast[data-variant='destructive']");

      if ($errorToasts.length === 0) {
        cy.log("No error toasts found");
        return cy.wrap<boolean>(false, { log: false });
      }

      cy.log(`Found ${$errorToasts.length} error toast(s)`);

      if (!containing_message) {
        return cy.wrap<boolean>(false, { log: false });
      }

      // Check if any toast contains the message
      let found = false;
      $errorToasts.each((_, toast): false | void => {
        const text: string = Cypress.$(toast).text().toLowerCase();
        if (text.includes(containing_message.toLowerCase())) {
          found = true;
          cy.log(`Found error toast with message: ${containing_message}`);
          return false; // break the .each loop
        } else {
          cy.log(
            `Found error toast, but it doesn't match message ('${containing_message}'): '${text}'`,
          );
        }
      });

      return cy.wrap<boolean>(found, { log: false });
    });

  return isToastFound.then((found) => {
    if (typeof found === "boolean") return found;
    else return found[0];
  });
}
