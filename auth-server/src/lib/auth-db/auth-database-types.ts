import type {
  ApiServerDomainsTable,
  ApiServersTable,
  AppsToApisPermissionsTable,
  AppsToHardcodedApisPermissionsTable,
} from "./apis";
import type { AppDomainsTable, AppsTable, AuthorizedAppsTable } from "./apps";
import type { AuthorizedHardcodedAppsTable } from "./apps/authorized-apps-registry/authorized-hardcoded-apps-table";
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
} from "./users";
import type { JwksAccessKeysForHardcodedTable, JwksAccessKeysTable } from "./jwks-access-keys";
import type { ServerSettingsTable } from "./server-settings";
import type { TokenRevocationsTable } from "./token-revocations";
import type { ServerTracesTable } from "./server-traces";
import type { ErrorsTable } from "./errors";
import type {
  UserMfaFactorsTable,
  UserMfaRecoveryCodesTable,
} from "./mfa";

export type AuthDatabase = {
  apps: AppsTable;
  app_domains: AppDomainsTable;
  api_servers: ApiServersTable;
  api_server_domains: ApiServerDomainsTable;
  authorized_apps: AuthorizedAppsTable;
  authorized_hardcoded_apps: AuthorizedHardcodedAppsTable;
  apps_to_apis_permissions: AppsToApisPermissionsTable;
  apps_to_hardcoded_apis_permissions: AppsToHardcodedApisPermissionsTable;
  users: UsersTable;
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
  server_settings: ServerSettingsTable;
  server_traces: ServerTracesTable;
  errors: ErrorsTable;
  user_mfa_factors: UserMfaFactorsTable;
  user_mfa_recovery_codes: UserMfaRecoveryCodesTable;
};
