// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import "./commands";

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<boolean>;
      register(
        email: string,
        password: string,
        invite_code?: string,
      ): Chainable<number>;
      create_and_login_as_superuser(): Chainable<boolean>;
      has_error_toast(containing_message?: string): Chainable<boolean>;
      logout(): Chainable<void>;
      is_authenticated(): Chainable<boolean>;
      is_admin(): Chainable<boolean>;
      create_invite_code(invite_code: string, max_uses: number): Chainable<boolean>;
      generate_random_code(length: number): string;
    }
  }
}
