import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import {
  type AppToApiPermission,
  appToApiPermissionSchema,
  appIdSchema,
  apiServerIdSchema,
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
  type AppId,
  type ApiServerId,
  SCHEMAVAULTS_AUTH_APP_ID,
  isHardcodedApiServerId,
  getHardcodedAppIdsForHardcodedApiServer,
  getHardcodedApp,
  type HardcodedAppId,
  isHardcodedAppId,
  getHardcodedApiServerIdsAllowedForHardcodedApp,
  type HardcodedApiServerId,
  getHardcodedApiServer,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import isValidUuid from "@/lib/is-valid-uuid";
import { ConflictError } from "@/lib/error/ConflictError";
import { AppNotConnectedToApiServerError } from "@/lib/error/AppNotConnectedToApiServerError";
import { appToHardcodedApiPermissionSchema } from "./apps-to-hardcoded-apis-permissions-table";

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
    client_app_id: AppId,
    api_server_id: ApiServerId,
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
    client_app_id: AppId,
    api_server_id: ApiServerId,
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

    if (client_app_id === SCHEMAVAULTS_AUTH_APP_ID && api_server_id === SCHEMAVAULTS_AUTH_APP_ID) {
      return this.createHardcodedAppToApiAuthorization(
        client_app_id,
        api_server_id,
      ) satisfies AppToApiPermission;
    }

    if (client_app_id === SCHEMAVAULTS_AUTH_APP_ID && api_server_id !== SCHEMAVAULTS_AUTH_APP_ID) {
      // hardcoded apps
      console.warn("Auth server app may only have auth server as audience");
      return null;
    }

    // dynamically defined app if this point was reached, but potentially still hardcoded api server


    // For hardcoded API servers, check the hardcoded permissions table
    if (isHardcodedApiServerId(api_server_id)) {
      const hardcodedRows = await this.db
        .selectFrom("apps_to_hardcoded_apis_permissions")
        .where("api_server_id", "=", api_server_id)
        .where("client_app_id", "=", client_app_id)
        .selectAll()
        .limit(1)
        .execute();

      if (hardcodedRows.length === 0) {
        return null;
      }

      const row = hardcodedRows[0]!;
      const createdAt: number =
        typeof row.created_at === "number"
          ? row.created_at
          : parseInt(row.created_at as unknown as string);

      return {
        client_app_id: row.client_app_id,
        api_server_id: row.api_server_id,
        created_at: createdAt,
        created_by: row.created_by ?? null,
      } satisfies AppToApiPermission;
    }

    if (!isValidUuid(api_server_id)) {
      console.error(
        "Expected API server ID to be a valid UUID if this point was reached! Is handling missing for a hardcoded endpoint?",
      );
      throw new TypeError("Expected API server ID to be a UUID!");
    }

    // dynamically defined app-to-api permissions if this point reached

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
    const permissionData = {
      client_app_id,
      api_server_id,
      created_at: Date.now(),
      created_by: created_by ?? null,
    };

    if (isHardcodedApiServerId(api_server_id)) {
      const parsed = await appToHardcodedApiPermissionSchema.safeParseAsync(permissionData);
      if (!parsed.success) {
        throw new Error("Invalid hardcoded app-to-API permission data");
      }

      try {
        const result = await this.db
          .insertInto("apps_to_hardcoded_apis_permissions")
          .values(parsed.data)
          .onConflict((oc) => oc.columns(["client_app_id", "api_server_id"]).doNothing())
          .executeTakeFirst();

        if (result.numInsertedOrUpdatedRows === BigInt(0)) {
          throw new ConflictError("This app is already connected to this API server");
        }
      } catch (e: unknown) {
        if (e instanceof ConflictError) throw e;
        console.error(e);
        throw new Error("Failed to grant client app access to hardcoded API server");
      }
      return;
    }

    const parsed = await appToApiPermissionSchema.safeParseAsync(permissionData);

    if (!parsed.success) {
      throw new Error("Invalid app-to-API permission data");
    }

    try {
      const result = await this.db
        .insertInto("apps_to_apis_permissions")
        .values(parsed.data)
        .onConflict((oc) => oc.columns(["client_app_id", "api_server_id"]).doNothing())
        .executeTakeFirst();

      if (result.numInsertedOrUpdatedRows === BigInt(0)) {
        throw new ConflictError("This app is already connected to this API server");
      }
    } catch (e: unknown) {
      if (e instanceof ConflictError) throw e;
      console.error(e);
      throw new Error("Failed to grant client app access to API server");
    }
  }

  /**
   * @name revoke
   * @description Revoke a previously-granted app-to-API permission. Throws
   *   {@link AppNotConnectedToApiServerError} when no such permission exists —
   *   the same error type the token-grant path raises when an app tries to use
   *   an API server it isn't connected to.
   * @param client_app_id Frontend client app UUID
   * @param api_server_id API server UUID
   */
  public async revoke(
    client_app_id: string,
    api_server_id: string,
  ): Promise<void> {
    if (!appIdSchema.safeParse(client_app_id).success) {
      throw new TypeError("Invalid frontend client app ID received");
    }
    if (!apiServerIdSchema.safeParse(api_server_id).success) {
      throw new TypeError("Invalid API server ID received");
    }

    // Hardcoded app paired with a hardcoded API is baked in at compile time
    // and cannot be revoked at runtime.
    if (isHardcodedAppId(client_app_id) && isHardcodedApiServerId(api_server_id)) {
      throw new Error(
        "Cannot revoke a hardcoded app-to-hardcoded-API permission",
      );
    }

    if (isHardcodedApiServerId(api_server_id)) {
      const result = await this.db
        .deleteFrom("apps_to_hardcoded_apis_permissions")
        .where("client_app_id", "=", client_app_id)
        .where("api_server_id", "=", api_server_id)
        .executeTakeFirst();

      if (result.numDeletedRows === BigInt(0)) {
        throw new AppNotConnectedToApiServerError(client_app_id, api_server_id);
      }
      return;
    }

    if (!isValidUuid(api_server_id)) {
      throw new TypeError("Expected API server ID to be a UUID!");
    }

    const result = await this.db
      .deleteFrom("apps_to_apis_permissions")
      .where("client_app_id", "=", client_app_id)
      .where("api_server_id", "=", api_server_id)
      .executeTakeFirst();

    if (result.numDeletedRows === BigInt(0)) {
      throw new AppNotConnectedToApiServerError(client_app_id, api_server_id);
    }
  }

  /**
   * @name listConnectedApps
   * @description List all client apps that have permission to access a given API server
   * @param api_server_id API server UUID
   */
  public async listConnectedApps(
    api_server_id: string,
  ): Promise<{ client_app_id: string; app_name: string; created_at: number }[]> {
    const parseCreatedAt = (created_at: number | string): number =>
      typeof created_at === "number"
        ? created_at
        : parseInt(created_at as unknown as string);

    if (isHardcodedApiServerId(api_server_id)) {
      // Get hardcoded apps that implicitly have permission
      const hardcodedAppIds: readonly HardcodedAppId[] = getHardcodedAppIdsForHardcodedApiServer(api_server_id);
      const hardcodedApps = hardcodedAppIds.map((appId) => {
        const definition = getHardcodedApp(appId);
        return {
          client_app_id: appId,
          app_name: definition?.app_name ?? appId,
          created_at: Date.now(),
        };
      });

      // Also get dynamically-added apps from the DB
      const dynamicRows = await this.db
        .selectFrom("apps_to_hardcoded_apis_permissions")
        .innerJoin("apps", "apps.app_id", "apps_to_hardcoded_apis_permissions.client_app_id")
        .where("apps_to_hardcoded_apis_permissions.api_server_id", "=", api_server_id)
        .select([
          "apps_to_hardcoded_apis_permissions.client_app_id",
          "apps.app_name",
          "apps_to_hardcoded_apis_permissions.created_at",
        ])
        .execute();

      const dynamicApps = dynamicRows.map((row) => ({
        client_app_id: row.client_app_id,
        app_name: row.app_name,
        created_at: parseCreatedAt(row.created_at),
      }));

      // Deduplicate (in case a hardcoded app was also added dynamically)
      const seen = new Set<string>(hardcodedApps.map((a) => a.client_app_id));
      const uniqueDynamic = dynamicApps.filter((a) => !seen.has(a.client_app_id));

      return [...hardcodedApps, ...uniqueDynamic];
    }

    const rows = await this.db
      .selectFrom("apps_to_apis_permissions")
      .innerJoin("apps", "apps.app_id", "apps_to_apis_permissions.client_app_id")
      .where("apps_to_apis_permissions.api_server_id", "=", api_server_id)
      .select([
        "apps_to_apis_permissions.client_app_id",
        "apps.app_name",
        "apps_to_apis_permissions.created_at",
      ])
      .execute();

    return rows.map((row) => ({
      client_app_id: row.client_app_id,
      app_name: row.app_name,
      created_at: parseCreatedAt(row.created_at),
    }));
  }

  /**
   * @name listConnectedApiServers
   * @description List all API servers that a given client app has permission to access
   * @param client_app_id Frontend client app UUID
   */
  public async listConnectedApiServers(
    client_app_id: string,
  ): Promise<{ api_server_id: string; api_server_name: string; created_at: number }[]> {
    if (isHardcodedAppId(client_app_id)) {
      const allowedHardcodedApiServerIds: readonly HardcodedApiServerId[] = getHardcodedApiServerIdsAllowedForHardcodedApp(client_app_id);
      return allowedHardcodedApiServerIds.map((api_server_id: HardcodedApiServerId) => {
        const api_definition = getHardcodedApiServer(api_server_id);
        return {
          api_server_id,
          api_server_name: api_definition.api_server_name,
          created_at: Date.now(),
        };
      });
    }

    const parseCreatedAt = (created_at: number | string): number =>
      typeof created_at === "number"
        ? created_at
        : parseInt(created_at as unknown as string);

    const [dynamicRows, hardcodedRows] = await Promise.all([
      this.db
        .selectFrom("apps_to_apis_permissions")
        .innerJoin("api_servers", "api_servers.api_server_id", "apps_to_apis_permissions.api_server_id")
        .where("apps_to_apis_permissions.client_app_id", "=", client_app_id)
        .select([
          "apps_to_apis_permissions.api_server_id",
          "api_servers.api_server_name",
          "apps_to_apis_permissions.created_at",
        ])
        .execute(),
      this.db
        .selectFrom("apps_to_hardcoded_apis_permissions")
        .where("apps_to_hardcoded_apis_permissions.client_app_id", "=", client_app_id)
        .selectAll()
        .execute(),
    ]);

    const dynamicResults = dynamicRows.map((row) => ({
      api_server_id: row.api_server_id,
      api_server_name: row.api_server_name,
      created_at: parseCreatedAt(row.created_at),
    }));

    const hardcodedResults = hardcodedRows.map((row) => {
      const definition: SchemaVaultsApiServerDefinition = getHardcodedApiServer(row.api_server_id);
      return {
        api_server_id: row.api_server_id,
        api_server_name: definition?.api_server_name ?? row.api_server_id,
        created_at: parseCreatedAt(row.created_at),
      };
    });

    return [...dynamicResults, ...hardcodedResults];
  }

  public constructor(
    protected readonly db: Kysely<AuthDatabase>,
    private readonly debug: boolean = false,
  ) {}
}
