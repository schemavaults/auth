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
import type { RegularUserCredentials } from "./actions/create_and_login_as_regular_user";
import type { CreateAppParams } from "./actions/create_app";
import type {
  CreateApiServerParams,
  CreateApiServerResult,
} from "./actions/create_api_server";
import type { CreateOrganizationParams } from "./actions/create_organization";
import type { GenerateJwksAccessKeyResult } from "./actions/generate_jwks_access_key";

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
      create_and_login_as_regular_user(): Chainable<RegularUserCredentials>;
      has_error_toast(containing_message?: string): Chainable<boolean>;
      // returns a list of all the text content within any active toasts. also prints it to the Cypress console.
      log_active_toasts(): Chainable<readonly string[]>;
      logout(): Chainable<void>;
      is_authenticated(): Chainable<boolean>;
      is_admin(): Chainable<boolean>;
      create_invite_code(
        invite_code: string,
        max_uses: number,
      ): Chainable<boolean>;
      create_organization(params: CreateOrganizationParams): Chainable<boolean>;
      create_api_server(
        params: CreateApiServerParams,
      ): Chainable<CreateApiServerResult>;
      create_app(params: CreateAppParams): Chainable<boolean>;
      generate_jwks_access_key(
        api_server_id: string,
      ): Chainable<GenerateJwksAccessKeyResult>;
      generate_random_code(length: number): Chainable<string>;
      open_dialog_with_button(
        // Button to click to open the dialog
        open_dialog_button_id: string,
        // Selector to ensure that the dialog opened successfully
        dialog_content_container_id: string,
      ): Chainable<JQuery<HTMLElement>>;
    }
  }
}
