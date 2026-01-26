import { type Kysely, sql } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import {
  type AppToApiPermission,
  appToApiPermissionSchema,
  appIdSchema,
  apiServerIdSchema,
  SCHEMAVAULTS_MAIL_APP_DEFINITION,
  SCHEMAVAULTS_WEB,
  SCHEMAVAULTS_CLI,
  SCHEMAVAULTS_REGISTRY_SERVER,
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
} from "@schemavaults/app-definitions";
import isValidUuid from "@/lib/is-valid-uuid";
import AbstractDatabaseResourceGroup from "@/lib/auth-db/AbstractAuthServerDatabaseResourceGroup";

/**
 * @name SchemaVaultsAppToApiPermissionsRegistry
 * @description Manage which frontend apps can access which backend application servers
 * @see SchemaVaultsAppRegistry To manage the list of frontend applications
 * @see AuthorizedAppsRegistry To manage which frontend apps a user has actually authorized
 * @see SchemaVaultsApiServerRegistry To manage the list of backend API servers
 */
export class SchemaVaultsAppToApiPermissionsRegistry {
  private readonly environment: SchemaVaultsAppEnvironment =
    getAppEnvironment();

  private createHardcodedAppToApiAuthorization(
    client_app_id: string,
    api_server_id: string,
  ): AppToApiPermission {
    const hardcodedPermission = {
      client_app_id,
      api_server_id,
      created_at: Date.now(),
    };
    if (this.debug) {
      console.log(
        "[SchemaVaultsAppToApiPermissionsRegistry] Created ('spoofed') hardcoded permission: ",
        hardcodedPermission,
      );
    }
    return hardcodedPermission;
  }

  private async lookupPermission(
    client_app_id: string,
    api_server_id: string,
  ): Promise<AppToApiPermission | null> {
    if (this.debug) {
      console.log(
        `[SchemaVaultsAppToApiPermissionsRegistry] lookupPermission(client_app_id='${client_app_id}', api_server_id='${api_server_id}')`,
      );
    }

    if (!appIdSchema.safeParse(client_app_id).success) {
      throw new Error("Invalid frontend client app ID received");
    }

    const parsed_api_server_id = apiServerIdSchema.safeParse(api_server_id);

    if (!parsed_api_server_id.success) {
      if (this.debug) {
        console.error(
          "Invalid API server ID received: ",
          parsed_api_server_id.error,
        );
      }

      throw new Error("Invalid API server ID received!");
    }

    // Allow web + cli access to https://api.schemavaults.com registry server
    if (
      (client_app_id === SCHEMAVAULTS_WEB.app_id ||
        client_app_id === SCHEMAVAULTS_CLI.app_id) &&
      api_server_id === SCHEMAVAULTS_REGISTRY_SERVER.api_server_id
    ) {
      return this.createHardcodedAppToApiAuthorization(
        client_app_id,
        api_server_id,
      ) satisfies AppToApiPermission;
    }

    // Allow web + cli + mail access to https://mail.schemavaults.com management server backend
    if (
      (client_app_id === SCHEMAVAULTS_WEB.app_id ||
        client_app_id === SCHEMAVAULTS_CLI.app_id ||
        client_app_id === SCHEMAVAULTS_MAIL_APP_DEFINITION.app_id) &&
      api_server_id === SCHEMAVAULTS_MAIL_APP_DEFINITION.app_id
    ) {
      return this.createHardcodedAppToApiAuthorization(
        client_app_id,
        api_server_id,
      ) satisfies AppToApiPermission;
    }

    if (!isValidUuid(api_server_id)) {
      console.error(
        "Expected API server ID to be a valid UUID if this point was reached! Is handling missing for a hardcoded endpoint?",
      );
      throw new Error("Expected API server ID to be a UUID!");
    }

    const rows = await this.db
      .selectFrom("apps_to_apis_permissions")
      .where("api_server_id", "=", api_server_id)
      .where("client_app_id", "=", client_app_id)
      .selectAll()
      .limit(1)
      .execute();

    if (rows.length === 0) {
      console.error(
        "App with ID 'client_app_id' does not have permission to use API server with ID 'api_server_id'",
      );
      return null;
    } else if (rows.length > 1) {
      throw new Error(
        "Multiple API server permissions found with the same api_server_id and client_app_id",
      );
    }

    console.assert(
      rows.length === 1,
      "Expected there to be exactly one app-to-API permission record retrieved from the database if this point was reached!",
    );

    const first_row = rows[0]!;
    if (!Object.hasOwn(first_row, "created_at")) {
      throw new Error("Missing creation date");
    }

    const createdAt: number =
      typeof first_row.created_at === "number"
        ? first_row.created_at
        : parseInt((first_row as unknown as { created_at: string }).created_at);
    if (isNaN(createdAt)) {
      throw new Error("Failed to parse created_at from database");
    }

    const parsed_app_to_api_permission =
      await appToApiPermissionSchema.safeParseAsync({
        ...first_row,
        created_at: createdAt,
      });
    if (!parsed_app_to_api_permission.success) {
      console.error(parsed_app_to_api_permission.error.errors);
      throw new Error("Failed to parse app to api permission from database");
    }
    return parsed_app_to_api_permission.data;
  }

  /**
   *
   * @param client_app_id Frontend client app UUID
   * @param api_server_id API server UUID
   */
  public async isAllowed(
    client_app_id: string,
    api_server_id: string,
  ): Promise<boolean> {
    try {
      const perm: AppToApiPermission | null = await this.lookupPermission(
        client_app_id,
        api_server_id,
      );
      const isAllowedResult: boolean = perm ? true : false;
      if (this.environment === "development") {
        console.log(
          "[SchemaVaultsAppToApiPermissionsRegistry] isAllowed() -> ",
          isAllowedResult,
        );
      }
      return isAllowedResult;
    } catch (e: unknown) {
      console.error(e);
      throw new Error(
        "Failed to check if client app is allowed to access API server",
      );
    }
  }

  /**
   * @name allow
   * @description Grant a frontend app access to an API server
   * @param client_app_id Frontend client app UUID
   * @param api_server_id API server UUID
   */
  public async allow(
    client_app_id: string,
    api_server_id: string,
    created_by: string | null | undefined = undefined
  ): Promise<void> {
    const parsed = await appToApiPermissionSchema.safeParseAsync({
      client_app_id,
      api_server_id,
      created_at: Date.now(),
      created_by: created_by ?? null
    });

    if (!parsed.success) {
      throw new Error
    }

    try {
      await this.db
        .insertInto("apps_to_apis_permissions")
        .values(parsed.data)
        .execute();
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to grant client app access to API server");
    }
  }

  public constructor(
    protected readonly db: Kysely<AuthDatabase>,
    private readonly debug: boolean = false,
  ) {}
}
