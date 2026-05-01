import createAndLoginAsRegularUser from "@/actions/create_and_login_as_regular_user";
import createAndLoginAsSuperuser from "@/actions/create_and_login_as_superuser";
import createApp from "@/actions/create_app";
import createInviteCode from "@/actions/create_invite_code";
import createApiServer from "@/actions/create_api_server";
import createOrganization from "@/actions/create_organization";
import deleteOrganization from "@/actions/delete_organization";
import generate_random_code from "@/actions/generate_random_code";
import generateJwksAccessKey from "@/actions/generate_jwks_access_key";
import hasErrorToast from "@/actions/has_error_toast";
import is_admin from "@/actions/is_admin";
import as_admin from "@/actions/as_admin";
import is_authenticated from "@/actions/is_authenticated";
import login from "@/actions/login";
import logout from "@/actions/logout";
import register from "@/actions/register";
import reset_rate_limit from "@/actions/reset_rate_limit";
import open_dialog_with_button from "@/actions/open_dialog_with_button";
import log_active_toasts from "@/actions/log_active_toasts";
import is_invite_code_required from "@/actions/is_invite_code_required";
import generate_random_test_user_credentials from "@/actions/generate_random_test_user_credentials";
import wait_for_page_hydration from "@/actions/wait_for_page_hydration";
import connectAppToApi from "@/actions/connect_app_to_api";
import promoteMemberToOwner from "@/actions/promote_member_to_owner";
import inviteAndAcceptOrgMembership from "@/actions/invite_and_accept_org_membership";
import register_via_resource_server_pkce_flow from "@/actions/register_via_resource_server_pkce_flow";
import login_via_resource_server_pkce_flow from "@/actions/login_via_resource_server_pkce_flow";
import enroll_test_user_mfa from "@/actions/enroll_test_user_mfa";
import compute_totp_code from "@/actions/compute_totp_code";

export function registerAllActionCommands(commands: Cypress.Commands) {
  commands.add("login", login);

  commands.add("register", register);

  commands.add("reset_rate_limit", reset_rate_limit);

  commands.add("create_and_login_as_superuser", createAndLoginAsSuperuser);

  commands.add("has_error_toast", hasErrorToast);

  commands.add("log_active_toasts", log_active_toasts);

  commands.add("logout", logout);

  commands.add("is_authenticated", is_authenticated);

  commands.add("is_admin", is_admin);
  commands.add("as_admin", as_admin);

  commands.add("create_invite_code", createInviteCode);

  commands.add("generate_random_code", generate_random_code);

  commands.add(
    "generate_random_test_user_credentials",
    generate_random_test_user_credentials,
  );

  commands.add("create_and_login_as_regular_user", createAndLoginAsRegularUser);

  commands.add("create_organization", createOrganization);

  commands.add("delete_organization", deleteOrganization);

  commands.add("create_api_server", createApiServer);

  commands.add("create_app", createApp);

  commands.add("open_dialog_with_button", open_dialog_with_button);

  commands.add("generate_jwks_access_key", generateJwksAccessKey);

  commands.add("is_invite_code_required", is_invite_code_required);

  commands.add("wait_for_page_hydration", wait_for_page_hydration);

  commands.add("connect_app_to_api", connectAppToApi);

  commands.add("promote_member_to_owner", promoteMemberToOwner);

  commands.add(
    "invite_and_accept_org_membership",
    inviteAndAcceptOrgMembership,
  );

  commands.add(
    "register_via_resource_server_pkce_flow",
    register_via_resource_server_pkce_flow,
  );

  commands.add(
    "login_via_resource_server_pkce_flow",
    login_via_resource_server_pkce_flow,
  );

  commands.add("enroll_test_user_mfa", enroll_test_user_mfa);
  commands.add("compute_totp_code", compute_totp_code);
}

export default registerAllActionCommands;
