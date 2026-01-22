import type {
  ApiServerDomainsTable,
  ApiServersTable,
  AppsToApisPermissionsTable,
} from "./apis";
import type { AppDomainsTable, AppsTable, AuthorizedAppsTable } from "./apps";
import type { JwtKeysTable } from "./jwt_keys";
import type {
  OrganizationMembershipRolesTable,
  OrganizationsTable,
} from "./organizations";
import type {
  AuthorizationCodesTable,
  PasswordsTable,
  UsersTable,
  InviteCodesTable,
} from "./users";
import type { JwksAccessKeysForHardcodedTable, JwksAccessKeysTable } from "./jwks-access-keys";

export type AuthDatabase = {
  apps: AppsTable;
  app_domains: AppDomainsTable;
  api_servers: ApiServersTable;
  api_server_domains: ApiServerDomainsTable;
  authorized_apps: AuthorizedAppsTable;
  apps_to_apis_permissions: AppsToApisPermissionsTable;
  users: UsersTable;
  passwords: PasswordsTable;
  authorization_codes: AuthorizationCodesTable;
  invite_codes: InviteCodesTable;
  organizations: OrganizationsTable;
  organization_membership_roles: OrganizationMembershipRolesTable;
  jwt_keys: JwtKeysTable;
  jwks_access_keys: JwksAccessKeysTable;
  jwks_access_keys_for_hardcoded: JwksAccessKeysForHardcodedTable;
};
