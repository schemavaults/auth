/// <reference types="cypress" />
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
// declare global {
//   namespace Cypress {
//     interface Chainable {
//       login(email: string, password: string): Chainable<void>
//       drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
//     }
//   }
// }

Cypress.Commands.add("login", (email: string, password: string) => {
  cy.visit("/auth/login");
  cy.url().should("include", "/auth/login");
  cy.get("input[name='email']", { log: false }).type(email);
  cy.get("input[name='password']", { log: false }).type(password);
  cy.get("button[type='submit']", { log: false }).click();
  cy.wait(1500);
  cy.url().should("not.include", "login");
});

Cypress.Commands.add(
  "register",
  (email: string, password: string, invite_code?: string) => {
    cy.visit("/auth/register");
    cy.url().should("include", "/auth/register");
    cy.get("input[name='email']", { log: false }).type(email);
    cy.get("input[name='password']", { log: false }).type(password);
    cy.get("input[name='confirm']", { log: false }).type(password);
    if (invite_code) {
      cy.get("input[name='invite_code']", { log: false }).type(invite_code);
    }
    cy.get("button[type='submit']").click();
    cy.wait(1500);
    cy.url().should("not.include", "/auth/register");
  },
);

class SuperuserCreatedCache {
  public static created: boolean = false;
}

Cypress.Commands.add("create_and_login_as_superuser", () => {
  const credentials = {
    email: "admin@schemavaults.com",
    password: "Password123!",
  };
  if (SuperuserCreatedCache.created) {
    cy.login(credentials.email, credentials.password);
    cy.url().should("not.include", "/auth/login");
  }

  const invite_code: string | undefined = Cypress.env(
    "PRIVATE_SUPERUSER_INVITE_CODE",
  );
  if (!invite_code) {
    throw new Error(
      "PRIVATE_SUPERUSER_INVITE_CODE environment variable is not set",
    );
  }

  cy.log(`Attempting to create superuser with invite code: '${invite_code}'`);

  cy.visit("/auth/register");
  cy.url({ log: false }).should("include", "/auth/register");
  cy.get("input[name='email']", { log: false }).type(credentials.email);
  cy.get("input[name='password']", { log: false }).type(credentials.password);
  cy.get("input[name='confirm']", { log: false }).type(credentials.password);
  cy.get("input[name='invite_code']", { log: false }).type(invite_code);
  cy.get("button[type='submit']", { log: false }).click();

  cy.wait(2500);

  cy.url().then((url: string) => {
    if (url.includes("/auth/register")) {
      // if error message includes 'already exists', then try to login instead
      cy.has_error_toast("already exists").then(() => {
        cy.log(`Found error toast with message: already exists`);
        SuperuserCreatedCache.created = true;
        cy.login(credentials.email, credentials.password);
      });
      return;
    }

    if (!url.includes("/auth/register")) {
      SuperuserCreatedCache.created = true;
      cy.url().should("not.include", "/auth/register");
    }
  });
});

Cypress.Commands.add("has_error_toast", (containing_message?: string) => {
  return cy.get("body", { log: false }).then(($body) => {
    const $errorToasts = $body.find("li.toast[data-variant='destructive']");

    if ($errorToasts.length === 0) {
      cy.log("No error toasts found");
      return false;
    }

    cy.log(`Found ${$errorToasts.length} error toast(s)`);

    if (!containing_message) {
      return true;
    }

    // Check if any toast contains the message
    let found = false;
    $errorToasts.each((_, toast) => {
      const text = Cypress.$(toast).text().toLowerCase();
      if (text.includes(containing_message.toLowerCase())) {
        found = true;
        cy.log(`Found error toast with message: ${containing_message}`);
        return false; // break the .each loop
      }
    });

    return found;
  });
});
