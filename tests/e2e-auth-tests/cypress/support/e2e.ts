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
import type { CreateAppParams } from "./actions/create_app";
import type {
  CreateApiServerParams,
  CreateApiServerResult,
} from "./actions/create_api_server";
import type { CreateOrganizationParams } from "./actions/create_organization";
import type {
  DeleteOrganizationParams,
  DeleteOrganizationResult,
} from "./actions/delete_organization";
import type { GenerateJwksAccessKeyResult } from "./actions/generate_jwks_access_key";
import type { WaitForPageHydrationOptions } from "./actions/wait_for_page_hydration";
import type {
  ConnectAppToApiParams,
  ConnectAppToApiResult,
} from "./actions/connect_app_to_api";
import type { PromoteMemberToOwnerParams } from "./actions/promote_member_to_owner";
import type {
  InviteAndAcceptOrgMembershipParams,
  InviteAndAcceptOrgMembershipResult,
} from "./actions/invite_and_accept_org_membership";

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
      create_and_login_as_regular_user(credentials: {
        email: string;
        password: string;
      }): Chainable<boolean>;
      has_error_toast(containing_message?: string): Chainable<boolean>;
      // returns a list of all the text content within any active toasts. also prints it to the Cypress console.
      log_active_toasts(): Chainable<readonly string[]>;
      logout(): Chainable<void>;
      is_authenticated(): Chainable<boolean>;
      is_admin(): Chainable<boolean>;
      as_admin<T>(run_once_admin: () => Chainable<T>): Chainable<T>;
      create_invite_code(
        invite_code: string,
        max_uses: number,
      ): Chainable<boolean>;
      create_organization(params: CreateOrganizationParams): Chainable<boolean>;
      delete_organization(
        params: DeleteOrganizationParams,
      ): Chainable<DeleteOrganizationResult>;
      create_api_server(
        params: CreateApiServerParams,
      ): Chainable<CreateApiServerResult>;
      create_app(params: CreateAppParams): Chainable<boolean>;
      generate_jwks_access_key(
        api_server_id: string,
      ): Chainable<GenerateJwksAccessKeyResult>;
      generate_random_code(length: number): Chainable<string>;
      generate_random_test_user_credentials(): Chainable<{
        email: string;
        password: string;
      }>;
      open_dialog_with_button(
        // Button to click to open the dialog
        open_dialog_button_id: string,
        // Selector to ensure that the dialog opened successfully
        dialog_content_container_id: string,
      ): Chainable<JQuery<HTMLElement>>;
      is_invite_code_required(): Chainable<boolean>;
      wait_for_page_hydration(
        options?: WaitForPageHydrationOptions,
      ): Chainable<void>;
      connect_app_to_api(
        params: ConnectAppToApiParams,
      ): Chainable<ConnectAppToApiResult>;
      promote_member_to_owner(
        params: PromoteMemberToOwnerParams,
      ): Chainable<boolean>;
      invite_and_accept_org_membership(
        params: InviteAndAcceptOrgMembershipParams,
      ): Chainable<InviteAndAcceptOrgMembershipResult>;
    }
  }
}
