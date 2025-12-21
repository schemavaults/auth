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
  cy.wait(1250, { log: false });
  cy.log(`Attempting to login as user: '${email}'`);
  cy.url({ log: false }).should("include", "/auth/login");

  cy.get("input[name='email']", { log: false }).then(($input) => {
    if ($input.is(":disabled")) {
      cy.log("Email input is disabled, waiting a few seconds...");
      cy.wait(3000, { log: false });
    } else {
      cy.log("Email input does not appear to be disabled...");
    }
  });

  cy.get("input[name='email']", { log: false })
    .should("not.be.disabled")
    .type(email);
  cy.get("input[name='password']", { log: false })
    .should("not.be.disabled")
    .type(password);
  cy.get("button[type='submit']", { log: false })
    .should("not.be.disabled")
    .click();
  cy.wait(3000);
  cy.url().should("not.include", "login");
});

Cypress.Commands.add(
  "register",
  (email: string, password: string, invite_code?: string) => {
    cy.visit("/auth/register");
    cy.wait(1250, { log: false });
    cy.log(`Attempting to register as user: '${email}'`);
    cy.url({ log: false }).should("include", "/auth/register");

    cy.get("input[name='email']", { log: false }).then(($input) => {
      if ($input.is(":disabled")) {
        cy.log("Email input is disabled, waiting a few seconds...");
        cy.wait(3000, { log: false });
      } else {
        cy.log("Email input does not appear to be disabled...");
      }
    });

    cy.get("input[name='email']", { log: false })
      .should("not.be.disabled")
      .type(email);
    cy.get("input[name='password']", { log: false })
      .should("not.be.disabled")
      .type(password);
    cy.get("input[name='confirm']", { log: false })
      .should("not.be.disabled")
      .type(password);
    if (invite_code) {
      cy.get("input[name='invite_code']", { log: false })
        .should("not.be.disabled")
        .type(invite_code);
    }
    cy.get("button[type='submit']").should("not.be.disabled").click();
    cy.wait(3000);
    cy.url().should("not.include", "/auth/register");
  },
);

class SuperuserCreatedCache {
  public static created: boolean = false;
}

Cypress.Commands.add("create_and_login_as_superuser", () => {
  const credentials = {
    email: Cypress.env("PRIVATE_SUPERUSER_EMAIL"),
    password: Cypress.env("PRIVATE_SUPERUSER_PASSWORD"),
  };
  if (!credentials.email || !credentials.password) {
    throw new Error(
      "PRIVATE_SUPERUSER_EMAIL and PRIVATE_SUPERUSER_PASSWORD environment variables are not set",
    );
  }
  if (SuperuserCreatedCache.created) {
    cy.log(
      "Superuser appears to be marked as already created-- attempting to login right away...",
    );
    cy.login(credentials.email, credentials.password);
    cy.url({ log: false }).should("not.include", "/auth/login");
    return;
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

  cy.url({ log: false }).then((url: string) => {
    cy.log("Registration should have completed by now; checking URL: ", url);
    const redirected: boolean = !url.includes("/auth/register");
    if (!redirected) {
      cy.log(
        "Submitting registration form does not seem to have redirected user.",
      );
      // if error message includes 'already exists', then try to login instead
      cy.has_error_toast("already exists").then(
        (alreadyExistsError: boolean) => {
          if (alreadyExistsError) {
            cy.log(`Found error toast with message: already exists`);
            SuperuserCreatedCache.created = true;
            cy.login(credentials.email, credentials.password);
          }
        },
      );
      return;
    } else {
      cy.log("Submitting registration form appears to have redirected user.");
      // user was redirected off the register page
      cy.url().should("not.include", "/auth/register");
      SuperuserCreatedCache.created = true;
    }
  });
}); // end of create_and_login_as_superuser command

Cypress.Commands.add(
  "has_error_toast",
  (containing_message?: string): Cypress.Chainable<boolean> => {
    cy.log(
      "Attempting to find error toast" + typeof containing_message === "string"
        ? ` with message: '${containing_message}'`
        : "",
    );

    const isToastFound: Cypress.Chainable<JQuery<boolean>> = cy
      .get("body", { log: false })
      .then(($body): Cypress.Chainable<JQuery<boolean>> => {
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
          const text = Cypress.$(toast).text().toLowerCase();
          if (text.includes(containing_message.toLowerCase())) {
            found = true;
            cy.log(`Found error toast with message: ${containing_message}`);
            return false; // break the .each loop
          }
        });

        return cy.wrap<boolean>(found, { log: false });
      });

    return isToastFound.then((found: JQuery<boolean>) => {
      const boolValue: boolean = found[0];
      return boolValue;
    });
  },
); // end of has_error_toast command
