import "server-only";

import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import type {
  SchemaVaultsApiServerDefinition,
  SchemaVaultsApiServerDomainRef,
  ApiServerId,
  ApiServerDomainVerification,
  OrganizationMembershipVisibility,
  ResourceUrlMatchMode,
} from "@schemavaults/app-definitions";
import { listApiServerDomainVerifications } from "@/lib/api-server-domain-verification/list-api-server-domain-verifications";
import { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { getApiServer } from "./get-api-server";
import { getApiServerDomains } from "./get-api-server-domains";
import { registerApiServer, type RegisterApiServerOptions } from "./register-api-server";
import { listApiServersAccessibleToUser } from "./list-api-servers-accessible-to-user";
import { listUserOwnedApiServers } from "./list-user-owned-api-servers";
import { listAllApiServers } from "./list-all-api-servers";
import { listOrganizationApiServers } from "./list-organization-api-servers";
import { setApiServerDynamicClientPolicy } from "./set-api-server-dynamic-client-policy";
import { setApiServerOrganizationMembershipVisibility } from "./set-api-server-organization-membership-visibility";
import { setApiServerDelegatedTokenPolicy } from "./set-api-server-delegated-token-policy";
import { addApiServerDomain } from "./add-api-server-domain";
import { removeApiServerDomain } from "./remove-api-server-domain";

/**
 * @name SchemaVaultsApiServerRegistry
 * @description Manage backend application servers. A facade over this
 * folder's query functions (one per module, each taking the database
 * handle first): it binds them to a database handle and holds no logic of
 * its own.
 * @see SchemaVaultsAppRegistry To manage the list of frontend applications
 * @see AuthorizedAppsRegistry To manage which frontend apps a user has actually authorized
 */
export class SchemaVaultsApiServerRegistry {
  private readonly debug: boolean;

  public constructor(protected readonly db: Kysely<AuthDatabase>, debug: boolean = shouldEnableDebug()) {
    this.debug = debug;
  }

  /** @see getApiServer */
  public async getApiServer(
    api_server_id: ApiServerId,
  ): Promise<SchemaVaultsApiServerDefinition | null> {
    return await getApiServer(this.db, api_server_id, this.debug);
  }

  /** @see getApiServerDomains */
  public async getApiServerDomains(
    api_server_id: ApiServerId,
  ): Promise<readonly SchemaVaultsApiServerDomainRef[]> {
    return await getApiServerDomains(this.db, api_server_id, this.debug);
  }

  /**
   * @description The ownership verification state of each of the API
   * server's domains (none for hardcoded API servers); see
   * `listApiServerDomainVerifications()`.
   */
  public async getApiServerDomainVerifications(
    api_server_id: ApiServerId,
  ): Promise<readonly ApiServerDomainVerification[]> {
    return await listApiServerDomainVerifications(this.db, api_server_id);
  }

  /** @see registerApiServer */
  public async registerApiServer(options: RegisterApiServerOptions): Promise<void> {
    return await registerApiServer(this.db, options);
  }

  /** @see listApiServersAccessibleToUser */
  public async listApiServersAccessibleToUser(
    user: UserData,
  ): Promise<readonly SchemaVaultsApiServerDefinition[]> {
    return await listApiServersAccessibleToUser(this.db, user);
  }

  /** @see listUserOwnedApiServers */
  public async listUserOwnedApiServers(
    uid: string,
  ): Promise<readonly SchemaVaultsApiServerDefinition[]> {
    return await listUserOwnedApiServers(this.db, uid);
  }

  /** @see listAllApiServers */
  public async listAllApiServers(): Promise<readonly SchemaVaultsApiServerDefinition[]> {
    return await listAllApiServers(this.db);
  }

  /** @see setApiServerDynamicClientPolicy */
  public async setApiServerDynamicClientPolicy(
    api_server_id: ApiServerId,
    policy: {
      allow_dynamic_clients?: boolean;
      resource_url_match_mode?: ResourceUrlMatchMode;
    },
  ): Promise<SchemaVaultsApiServerDefinition | null> {
    return await setApiServerDynamicClientPolicy(this.db, api_server_id, policy, this.debug);
  }

  /** @see setApiServerOrganizationMembershipVisibility */
  public async setApiServerOrganizationMembershipVisibility(
    api_server_id: ApiServerId,
    visibility: OrganizationMembershipVisibility,
  ): Promise<SchemaVaultsApiServerDefinition | null> {
    return await setApiServerOrganizationMembershipVisibility(this.db, api_server_id, visibility, this.debug);
  }

  /** @see setApiServerDelegatedTokenPolicy */
  public async setApiServerDelegatedTokenPolicy(
    api_server_id: ApiServerId,
    accept_delegated_tokens: boolean,
  ): Promise<SchemaVaultsApiServerDefinition | null> {
    return await setApiServerDelegatedTokenPolicy(this.db, api_server_id, accept_delegated_tokens, this.debug);
  }

  public async deleteApiServer(api_server_id: ApiServerId) {
    const fn = await import("./delete-api-server").then(m => m.default);
    return await fn(this.db, api_server_id);
  }

  /** @see addApiServerDomain */
  public async addApiServerDomain(
    api_server_id: string,
    new_domain: SchemaVaultsApiServerDomainRef,
  ): Promise<void> {
    return await addApiServerDomain(this.db, api_server_id, new_domain, this.debug);
  }

  /** @see removeApiServerDomain */
  public async removeApiServerDomain(
    api_server_id: ApiServerId,
    api_server_domain_ref_id: string,
  ): Promise<boolean> {
    return await removeApiServerDomain(this.db, api_server_id, api_server_domain_ref_id);
  }

  /** @see listOrganizationApiServers */
  public async listOrganizationApiServers(
    org_id: OrganizationID,
    user: UserData,
  ): Promise<readonly SchemaVaultsApiServerDefinition[]> {
    return await listOrganizationApiServers(this.db, org_id, user);
  }
}

export default SchemaVaultsApiServerRegistry;
