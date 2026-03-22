// log_active_toasts.ts

export default function log_active_toasts(): Cypress.Chainable<
  readonly string[]
> {
  return cy
    .get("body", { log: false })
    .then(
      (
        $body: JQuery<HTMLBodyElement>,
      ): Cypress.Chainable<readonly string[]> => {
        const $toasts = $body.find("li.toast");

        if ($toasts.length === 0) {
          return cy.wrap([] satisfies readonly never[] as readonly string[], {
            log: false,
          });
        }

        cy.log(`Found ${$toasts.length} toast(s)`);

        const $toastTexts: JQuery<string> = $toasts.map((_, toast) => {
          const text: string = Cypress.$(toast).text();
          return text;
        });

        $toastTexts.each((_, text: string): void => {
          cy.log("Toast Content: ", text);
        });

        const toastTexts: readonly string[] = [...$toastTexts.toArray()];

        return cy.wrap(toastTexts, { log: false });
      },
    );
}
