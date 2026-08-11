import type {
  ApiServerDomainsTable,
  ApiServersTable,
  AppsToApisPermissionsTable,
  AppsToHardcodedApisPermissionsTable,
} from "./apis";
import type {
  AppCallbackUrlsTable,
  AppClientSecretsTable,
  AppDomainsTable,
  AppsTable,
  AuthorizedAppsTable,
} from "./apps";
import type { JwtKeysTable } from "./jwt_keys";
import type {
  OrganizationMembershipRolesTable,
  OrganizationsTable,
  OrganizationInvitationsTable,
} from "./organizations";
import type {
  AuthorizationCodesTable,
  PasswordsTable,
  PasswordResetTokensTable,
  EmailVerificationTokensTable,
  UsersTable,
  InviteCodesTable,
  DeletedUserUidsTable,
} from "./users";
import type { JwksAccessKeysForHardcodedTable, JwksAccessKeysTable } from "./jwks-access-keys";
import type { ServerSettingsTable } from "./server-settings";
import type { ServerBrandingAssetsTable } from "./branding";
import type { TokenRevocationsTable } from "./token-revocations";
import type { IssuedTokensTable } from "./issued-tokens";
import type { ServerTracesTable } from "./server-traces";
import type { ErrorsTable } from "./errors";
import type {
  UserMfaFactorsTable,
  UserMfaRecoveryCodesTable,
  UserWebauthnCredentialsTable,
} from "./mfa";

export type AuthDatabase = {
  apps: AppsTable;
  app_domains: AppDomainsTable;
  app_callback_urls: AppCallbackUrlsTable;
  app_client_secrets: AppClientSecretsTable;
  api_servers: ApiServersTable;
  api_server_domains: ApiServerDomainsTable;
  authorized_apps: AuthorizedAppsTable;
  apps_to_apis_permissions: AppsToApisPermissionsTable;
  apps_to_hardcoded_apis_permissions: AppsToHardcodedApisPermissionsTable;
  users: UsersTable;
  deleted_user_uids: DeletedUserUidsTable;
  passwords: PasswordsTable;
  password_reset_tokens: PasswordResetTokensTable;
  email_verification_tokens: EmailVerificationTokensTable;
  authorization_codes: AuthorizationCodesTable;
  invite_codes: InviteCodesTable;
  organizations: OrganizationsTable;
  organization_membership_roles: OrganizationMembershipRolesTable;
  organization_invitations: OrganizationInvitationsTable;
  jwt_keys: JwtKeysTable;
  jwks_access_keys: JwksAccessKeysTable;
  jwks_access_keys_for_hardcoded: JwksAccessKeysForHardcodedTable;
  token_revocations: TokenRevocationsTable;
  issued_tokens: IssuedTokensTable;
  server_settings: ServerSettingsTable;
  server_branding_assets: ServerBrandingAssetsTable;
  server_traces: ServerTracesTable;
  errors: ErrorsTable;
  user_mfa_factors: UserMfaFactorsTable;
  user_mfa_recovery_codes: UserMfaRecoveryCodesTable;
  user_webauthn_credentials: UserWebauthnCredentialsTable;
};
