import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  type SchemaVaultsApp,
  schemaVaultsAppDefinitionSchema,
  isHardcodedAppId,
  type ResourceOwnership,
  type DynamicClientRegistrationMetadataFields,
} from "@schemavaults/app-definitions";
import { organizationIdSchema } from "@schemavaults/auth-common";
import { toOwnershipDatabaseColumns } from "@/lib/ownership/ownership-columns";
import { ConflictError } from "@/lib/error/ConflictError";
import type { NewApp } from "./apps-table";

export interface RegisterAppOptions {
  app_id: string;
  app_name: string;
  app_description: string;
  publicly_listed: boolean;
  /** Who the app belongs to; see `resolveRequestedOwnershipForCreation`. */
  ownership: ResourceOwnership;
  web: boolean;
  /** The creating user's uid, for the audit trail (null when unknown). */
  created_by?: string | null;
  /**
   * RFC 7591 metadata to persist; required for (and only allowed with)
   * `dynamic-client-registration` ownership. See
   * `dynamicClientRegistrationMetadataFieldsShape`.
   */
  dynamic_client_metadata?: DynamicClientRegistrationMetadataFields;
}

/**
 * JSONB column values are bound as JSON text so that Postgres stores the
 * JSON array itself (binding a JS array would be sent as a Postgres array
 * literal, which JSONB rejects). `undefined`/`null` store SQL NULL.
 */
function toJsonbColumnValue<T>(value: readonly T[] | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
}

/**
 * @description Inserts a new client application row (see
 * `registerAppWithRedirectTargets()` to create one with its domains and
 * callback URLs).
 * @throws ConflictError when the id is reserved by the platform or taken
 */
export async function registerApp(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  {
    app_id,
    app_name,
    app_description,
    publicly_listed,
    ownership,
    web,
    created_by = null,
    dynamic_client_metadata,
  }: RegisterAppOptions,
): Promise<void> {

  if (typeof publicly_listed !== 'boolean') {
    throw new TypeError("Expected 'publicly_listed' to be a boolean!")
  }

  if (typeof web !== 'boolean') {
    throw new TypeError("Expected 'web' to be a boolean!")
  }

  if (
    ownership.owner_type === "organization" &&
    !organizationIdSchema.safeParse(ownership.owner_organization_id).success
  ) {
    throw new TypeError("Received invalid organization ID to register application to!")
  }

  // Hardcoded app ids (the auth server's own id) have no database row, so
  // the insert's uniqueness conflict cannot protect them. Reject them here.
  if (isHardcodedAppId(app_id)) {
    throw new ConflictError(`App ID '${app_id}' is reserved by the platform`);
  }

  // Validate the API-facing shape first (id/name/description limits, etc.)
  const parsed_app = await schemaVaultsAppDefinitionSchema.safeParseAsync({
    app_id,
    app_name,
    app_description,
    created_at: Date.now(),
    public: publicly_listed ?? false,
    hardcoded: false,
    web,
    ...ownership,
    created_by,
    ...(dynamic_client_metadata ?? {}),
  } satisfies SchemaVaultsApp);
  if (!parsed_app.success) {
    console.error(parsed_app.error.issues);
    throw new Error("Failed to parse app");
  }
  const app: SchemaVaultsApp = parsed_app.data;

  if (
    (ownership.owner_type === "dynamic-client-registration") !==
    (dynamic_client_metadata !== undefined)
  ) {
    throw new TypeError(
      "RFC 7591 client metadata is stored for (and only for) dynamically registered clients",
    );
  }

  const row: NewApp = {
    app_id: app.app_id,
    app_name: app.app_name,
    app_description: app.app_description,
    created_at: app.created_at,
    public: app.public,
    hardcoded: false,
    web: app.web,
    ...toOwnershipDatabaseColumns(ownership),
    created_by,
    // JSONB columns: Kysely/pg serialize arrays as JSON when passed as
    // JSON text; stringify explicitly so a string[] is not bound as a
    // Postgres array literal.
    ...(dynamic_client_metadata
      ? {
          client_uri: dynamic_client_metadata.client_uri ?? null,
          logo_uri: dynamic_client_metadata.logo_uri ?? null,
          tos_uri: dynamic_client_metadata.tos_uri ?? null,
          policy_uri: dynamic_client_metadata.policy_uri ?? null,
          contacts: toJsonbColumnValue(dynamic_client_metadata.contacts),
          grant_types: toJsonbColumnValue(dynamic_client_metadata.grant_types),
          response_types: toJsonbColumnValue(
            dynamic_client_metadata.response_types,
          ),
          token_endpoint_auth_method:
            dynamic_client_metadata.token_endpoint_auth_method ?? null,
          software_id: dynamic_client_metadata.software_id ?? null,
          software_version: dynamic_client_metadata.software_version ?? null,
          registered_scope: dynamic_client_metadata.registered_scope ?? null,
          client_id_issued_at:
            dynamic_client_metadata.client_id_issued_at ?? null,
        }
      : {}),
  };

  const result = await db
    .insertInto("apps")
    .values(row)
    .onConflict((oc) => oc.column("app_id").doNothing())
    .executeTakeFirst();

  if (result.numInsertedOrUpdatedRows === BigInt(0)) {
    throw new ConflictError("An app with this ID already exists");
  }
}

export default registerApp;
