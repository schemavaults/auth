import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  type SchemaVaultsApp,
  schemaVaultsAppDefinitionSchema,
  getHardcodedSchemaVaultsApps,
} from "@schemavaults/app-definitions";
import { organizationIdSchema, type OrganizationID, type UserData } from "@schemavaults/auth-common";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import parseAppDefinitionDatabaseRow from "./parse-app-definition-database-row";

/**
 * @description Lists the apps an organization owns. The platform's owner
 * organization owns the platform-owned rows and the hardcoded apps.
 */
export async function listOrganizationApps(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  org_id: OrganizationID,
  user: UserData,
  debug: boolean = false,
): Promise<readonly SchemaVaultsApp[]> {

  const parsed_org_id = organizationIdSchema.safeParse(org_id);
  if (!parsed_org_id.success) {
    throw new TypeError("Invalid organization ID to list apps for!", {
      cause: parsed_org_id.error,
    });
  }

  if (!user) {
    throw new Error("You must be logged in to list apps");
  }

  if (debug) {
    console.log(
      `[SchemaVaultsAppRegistry] Attempting to list apps for organization: ${org_id}`,
    );
  }

  const MAX_PAGE_SIZE: number = 50;
  const ownerOrganizationId: OrganizationID = getAuthServerOwnerOrganizationId();

  let result: unknown[];
  try {
    // The platform's virtual organization "owns" the platform-owned rows
    // (owner_type = 'platform'); user-owned rows also have a NULL owner
    // organization, so the discriminant — not the NULL — selects them.
    result = await db
      .selectFrom("apps")
      .where((eb) =>
        org_id === ownerOrganizationId
          ? eb("owner_type", "=", "platform")
          : eb.and([
              eb("owner_type", "=", "organization"),
              eb("owner_organization_id", "=", org_id),
            ])
      )
      .limit(MAX_PAGE_SIZE)
      .selectAll()
      .execute();
  } catch (e: unknown) {
    console.error(
      `Failed to list apps for organization with ID '${org_id}':`,
      e,
    );
    throw new Error(`Failed to list apps for organization with ID: '${org_id}'`, { cause: e });
  }

  if (!Array.isArray(result)) {
    throw new Error("Expected database query result to be an array of rows");
  }

  const app_definitions: SchemaVaultsApp[] = [];

  try {
    const parsed = await schemaVaultsAppDefinitionSchema
      .array()
      .safeParseAsync(
        result.map((row) => parseAppDefinitionDatabaseRow(row)),
      );
    if (!parsed.success) {
      throw parsed.error;
    }
    app_definitions.push(...parsed.data)
  } catch (e: unknown) {
    console.error(e);
    throw new Error(
      "Failed to parse the apps data received from database for organization",
      { cause: e },
    );
  }

  if (org_id === ownerOrganizationId) {
    app_definitions.push(...getHardcodedSchemaVaultsApps().filter(
      s => s.owner_organization_id === ownerOrganizationId
    ));
  }

  return app_definitions
}

export default listOrganizationApps;
