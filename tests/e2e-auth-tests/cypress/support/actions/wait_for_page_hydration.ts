export interface WaitForPageHydrationOptions {
  waitForAuthReady?: boolean; // default: true
  timeout?: number; // default: 10000
  log?: boolean; // default: false
}

export default function wait_for_page_hydration(
  options?: WaitForPageHydrationOptions,
): void {
  const {
    waitForAuthReady = true,
    timeout = 10000,
    log = true,
  } = options ?? {};

  if (log)
    cy.log(
      `Waiting for Next.js app hydration (waitForAuthReady: ${waitForAuthReady})`,
    );

  cy.get("body[data-hydrated='true']", { timeout, log: false }).should("exist");

  if (waitForAuthReady) {
    cy.get("body[data-auth-ready='true']", { timeout, log: false }).should(
      "exist",
    );
  }
}
