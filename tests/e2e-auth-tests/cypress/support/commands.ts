/// <reference types="cypress" />

import createAndLoginAsRegularUser from "./actions/create_and_login_as_regular_user";
import createAndLoginAsSuperuser from "./actions/create_and_login_as_superuser";
import createInviteCode from "./actions/create_invite_code";
import createApiServer from "./actions/create_api_server";
import createOrganization from "./actions/create_organization";
import generate_random_code from "./actions/generate_random_code";
import hasErrorToast from "./actions/has_error_toast";
import is_admin from "./actions/is_admin";
import is_authenticated from "./actions/is_authenticated";
import login from "./actions/login";
import logout from "./actions/logout";
import register from "./actions/register";

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

Cypress.Commands.add("login", login);

Cypress.Commands.add("register", register);

Cypress.Commands.add(
  "create_and_login_as_superuser",
  createAndLoginAsSuperuser,
);

Cypress.Commands.add("has_error_toast", hasErrorToast);

Cypress.Commands.add("logout", logout);

Cypress.Commands.add("is_authenticated", is_authenticated);

Cypress.Commands.add("is_admin", is_admin);

Cypress.Commands.add('create_invite_code', createInviteCode)

Cypress.Commands.add("generate_random_code", generate_random_code);

Cypress.Commands.add(
  "create_and_login_as_regular_user",
  createAndLoginAsRegularUser,
);

Cypress.Commands.add("create_organization", createOrganization);

Cypress.Commands.add("create_api_server", createApiServer);