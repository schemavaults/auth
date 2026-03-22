export interface WaitForPageHydrationOptions {
  waitForAuthReady?: boolean; // default: true
  timeout?: number; // default: 10000
  log?: boolean; // default: false
}

const hydrationIndicatorId: string =
  "schemavaults-auth-server-hydration-marker";

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

  cy.get(`div#${hydrationIndicatorId}[data-hydrated="true"]`, {
    timeout,
    log: false,
  }).should("exist");

  if (waitForAuthReady) {
    cy.get(`div#${hydrationIndicatorId}[data-auth-ready="true"]`, {
      timeout,
      log: false,
    }).should("exist");
  }
}
