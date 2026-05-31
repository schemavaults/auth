import type { CreateAppParams, CreateAppResult } from "@/actions/create_app";
import type {
  CreateApiServerParams,
  CreateApiServerResult,
} from "@/actions/create_api_server";
import type { CreateOrganizationParams } from "@/actions/create_organization";
import type {
  DeleteOrganizationParams,
  DeleteOrganizationResult,
} from "@/actions/delete_organization";
import type { GenerateJwksAccessKeyResult } from "@/actions/generate_jwks_access_key";
import type { WaitForPageHydrationOptions } from "@/actions/wait_for_page_hydration";
import type {
  ConnectAppToApiParams,
  ConnectAppToApiResult,
} from "@/actions/connect_app_to_api";
import type { PromoteMemberToOwnerParams } from "@/actions/promote_member_to_owner";
import type {
  InviteAndAcceptOrgMembershipParams,
  InviteAndAcceptOrgMembershipResult,
} from "@/actions/invite_and_accept_org_membership";
import type { RegisterViaResourceServerPkceFlowParams } from "@/actions/register_via_resource_server_pkce_flow";
import type { LoginViaResourceServerPkceFlowParams } from "@/actions/login_via_resource_server_pkce_flow";
import type {
  EnrollTestUserMfaParams,
  EnrollTestUserMfaResult,
} from "@/actions/enroll_test_user_mfa";

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<boolean>;
      login_via_request(email: string, password: string): Chainable<boolean>;
      register(
        email: string,
        password: string,
        invite_code?: string,
      ): Chainable<number>;
      register_via_request(
        email: string,
        password: string,
        invite_code?: string,
      ): Chainable<number>;
      reset_rate_limit(): Chainable<boolean>;
      create_and_login_as_superuser(): Chainable<boolean>;
      create_and_login_as_superuser_via_request(): Chainable<boolean>;
      create_and_login_as_regular_user(credentials: {
        email: string;
        password: string;
        invite_code?: string;
      }): Chainable<boolean>;
      create_and_login_as_regular_user_via_request(credentials: {
        email: string;
        password: string;
        invite_code?: string;
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
      create_organization_via_request(
        params: CreateOrganizationParams,
      ): Chainable<boolean>;
      delete_organization(
        params: DeleteOrganizationParams,
      ): Chainable<DeleteOrganizationResult>;
      create_api_server(
        params: CreateApiServerParams,
      ): Chainable<CreateApiServerResult>;
      create_app(params: CreateAppParams): Chainable<CreateAppResult>;
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
      register_via_resource_server_pkce_flow(
        params: RegisterViaResourceServerPkceFlowParams,
      ): Chainable<boolean>;
      login_via_resource_server_pkce_flow(
        params: LoginViaResourceServerPkceFlowParams,
      ): Chainable<boolean>;
      enroll_test_user_mfa(
        params: EnrollTestUserMfaParams,
      ): Chainable<EnrollTestUserMfaResult>;
      compute_totp_code(secret: string): Chainable<string>;
      // Registers a CDP virtual WebAuthn authenticator and yields its id.
      // Chromium-only (unavailable under Electron); see the action file.
      add_virtual_authenticator(): Chainable<string>;
      remove_virtual_authenticator(
        authenticatorId: string,
      ): Chainable<undefined>;
    }
  }
}

export type Chainable = Cypress.Chainable;
