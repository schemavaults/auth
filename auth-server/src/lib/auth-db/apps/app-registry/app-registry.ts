import "server-only";
import type {
  SchemaVaultsApp,
  ListAppsQueryType,
  SchemaVaultsAppDomainRef,
  SchemaVaultsAppCallbackUrlRef,
  SchemaVaultsAppEnvironment,
  AppId,
} from "@schemavaults/app-definitions";
import { getAppEnvironment } from "@schemavaults/app-definitions";
import type { AppClientSecret } from "./app-client-secrets-table";
import type { AppServiceAccountOrganizationRole } from "./app-service-account-organization-roles-table";
import type { GetOrCreateAppServiceAccountResult } from "./app-service-accounts";
import type { UserDocument } from "@/lib/auth-db/users";
import type { AssignableOrganizationMembershipRole, OrganizationID, UserData } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import listApps from "./list-apps";
import { getAppDomains } from "./get-app-domains";
import { registerApp, type RegisterAppOptions } from "./register-app";
import { listAppsAccessibleToUser } from "./list-apps-accessible-to-user";
import { listUserOwnedApps } from "./list-user-owned-apps";
import { listOrganizationApps } from "./list-organization-apps";
import { addAppDomain } from "./add-app-domain";
import { removeAppDomain } from "./remove-app-domain";

/**
 * @name SchemaVaultsAppRegistry
 * @description Manage available frontend client applications which can access SchemaVaults APIs.
 * A facade over this folder's query functions (one per module, each taking
 * the database handle first): it binds them to a database handle and holds
 * no logic of its own.
 * @see AuthorizedAppsRegistry To manage which apps a user has actually authorized
 * @see SchemaVaultsApiServerRegistry Backend API servers which frontend applications can actually access
 */
export class SchemaVaultsAppRegistry {
  private readonly env: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;

  public constructor(protected readonly db: Kysely<AuthDatabase>) {
    this.env = getAppEnvironment();
    this.debug =
      this.env === "development" ||
      this.env === "staging" ||
      this.env === "test";
  }

  public async getApp(app_id: string): Promise<SchemaVaultsApp | null> {
    const getApp = await import("./get-app").then(mod => mod.default)
    return await getApp(this.db, app_id, this.debug);
  }

  /** @see getAppDomains */
  public async getAppDomains(
    app_id: AppId,
  ): Promise<readonly SchemaVaultsAppDomainRef[]> {
    return await getAppDomains(this.db, app_id);
  }

  /** @see registerApp */
  public async registerApp(options: RegisterAppOptions): Promise<void> {
    return await registerApp(this.db, options);
  }

  /** @see listAppsAccessibleToUser */
  public async listAppsAccessibleToUser(
    user: UserData,
  ): Promise<SchemaVaultsApp[]> {
    return await listAppsAccessibleToUser(this.db, user, this.debug);
  }

  /** @see listUserOwnedApps */
  public async listUserOwnedApps(uid: string): Promise<SchemaVaultsApp[]> {
    return await listUserOwnedApps(this.db, uid);
  }

  public async listApps(
    type: Exclude<ListAppsQueryType, "authorized">,
    user: UserData,
  ): Promise<SchemaVaultsApp[]> {
    return await listApps(this.db, type, user, this.debug);
  }

  /** @see listOrganizationApps */
  public async listOrganizationApps(
    org_id: OrganizationID,
    user: UserData,
  ): Promise<readonly SchemaVaultsApp[]> {
    return await listOrganizationApps(this.db, org_id, user, this.debug);
  }

  public async deleteApp(app_id: string) {
    const fn = await import("./delete-app").then(m => m.default);
    return await fn(this.db, app_id);
  }

  public async getAppCallbackUrls(
    app_id: AppId,
  ): Promise<readonly SchemaVaultsAppCallbackUrlRef[]> {
    const fn = await import("./app-callback-urls").then(
      (m) => m.listAppCallbackUrls,
    );
    return await fn(this.db, app_id);
  }

  public async getAppCallbackUrlsForEnvironment(
    app_id: AppId,
    environment: SchemaVaultsAppEnvironment,
  ): Promise<readonly SchemaVaultsAppCallbackUrlRef[]> {
    const fn = await import("./app-callback-urls").then(
      (m) => m.listAppCallbackUrlsForEnvironment,
    );
    return await fn(this.db, app_id, environment);
  }

  public async addAppCallbackUrl(
    app_id: AppId,
    new_callback_url: SchemaVaultsAppCallbackUrlRef,
  ): Promise<void> {
    const fn = await import("./app-callback-urls").then(
      (m) => m.addAppCallbackUrl,
    );
    return await fn(this.db, app_id, new_callback_url);
  }

  public async removeAppCallbackUrl(
    app_id: AppId,
    app_callback_url_ref_id: string,
  ): Promise<boolean> {
    const fn = await import("./app-callback-urls").then(
      (m) => m.removeAppCallbackUrl,
    );
    return await fn(this.db, app_id, app_callback_url_ref_id);
  }

  public async getClientSecretRecord(
    app_id: AppId,
  ): Promise<AppClientSecret | null> {
    const fn = await import("./app-client-secrets").then(
      (m) => m.getAppClientSecretRecord,
    );
    return await fn(this.db, app_id);
  }

  public async setClientSecret(
    app_id: AppId,
    secret_hash: string,
    created_by: string | null,
  ): Promise<void> {
    const fn = await import("./app-client-secrets").then(
      (m) => m.setAppClientSecret,
    );
    return await fn(this.db, app_id, secret_hash, created_by);
  }

  public async deleteClientSecret(app_id: AppId): Promise<boolean> {
    const fn = await import("./app-client-secrets").then(
      (m) => m.deleteAppClientSecret,
    );
    return await fn(this.db, app_id);
  }

  /** The app's service account (client_credentials subject), or null. */
  public async getServiceAccount(app_id: AppId): Promise<UserDocument | null> {
    const fn = await import("./app-service-accounts").then(
      (m) => m.getAppServiceAccount,
    );
    return await fn(this.db, app_id);
  }

  public async getOrCreateServiceAccount(
    app_id: AppId,
    debug: boolean = false,
  ): Promise<GetOrCreateAppServiceAccountResult> {
    const fn = await import("./app-service-accounts").then(
      (m) => m.getOrCreateAppServiceAccount,
    );
    return await fn(this.db, app_id, debug);
  }

  public async deleteServiceAccount(
    app_id: AppId,
    debug: boolean = false,
  ): Promise<boolean> {
    const fn = await import("./app-service-accounts").then(
      (m) => m.deleteAppServiceAccount,
    );
    return await fn(this.db, app_id, debug);
  }

  /**
   * The organization role configured for the app's service account (a
   * virtual membership of the organization that owns the app), or null.
   */
  public async getServiceAccountOrganizationRole(
    app_id: AppId,
  ): Promise<AppServiceAccountOrganizationRole | null> {
    const fn = await import("./app-service-account-organization-roles").then(
      (m) => m.getAppServiceAccountOrganizationRole,
    );
    return await fn(this.db, app_id);
  }

  public async setServiceAccountOrganizationRole(
    app_id: AppId,
    role: AssignableOrganizationMembershipRole,
    updated_by: string | null,
  ): Promise<void> {
    const fn = await import("./app-service-account-organization-roles").then(
      (m) => m.setAppServiceAccountOrganizationRole,
    );
    return await fn(this.db, app_id, role, updated_by);
  }

  public async deleteServiceAccountOrganizationRole(
    app_id: AppId,
  ): Promise<boolean> {
    const fn = await import("./app-service-account-organization-roles").then(
      (m) => m.deleteAppServiceAccountOrganizationRole,
    );
    return await fn(this.db, app_id);
  }

  /** @see addAppDomain */
  public async addAppDomain(
    app_id: string,
    new_app_domain: SchemaVaultsAppDomainRef,
  ): Promise<void> {
    return await addAppDomain(this.db, app_id, new_app_domain);
  }

  /** @see removeAppDomain */
  public async removeAppDomain(
    app_id: AppId,
    app_domain_ref_id: string,
  ): Promise<boolean> {
    return await removeAppDomain(this.db, app_id, app_domain_ref_id);
  }
}

export default SchemaVaultsAppRegistry;
