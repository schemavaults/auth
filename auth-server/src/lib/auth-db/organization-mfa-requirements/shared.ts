import "server-only";
import { organizationIdSchema, type OrganizationID } from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";
import type { OrganizationMfaGracePeriodRow } from "./organization-mfa-requirements-table";
import type { OrganizationMfaGracePeriod } from "./types";

/**
 * Helpers shared by this folder's queries (not re-exported from ./index):
 * BIGINT columns arrive as strings from the `pg` driver, and every query
 * validates its organization id / uid arguments.
 */

export type Db = Kysely<AuthDatabase> | Transaction<AuthDatabase>;

export function toNumber(value: unknown): number {
  return typeof value === "string" ? parseInt(value, 10) : Number(value);
}

export function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : toNumber(value);
}

export function assertOrganizationId(organization_id: string): asserts organization_id is OrganizationID {
  if (!organizationIdSchema.safeParse(organization_id).success) {
    throw new TypeError("Invalid organization ID!");
  }
}

export function assertUid(uid: string): void {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
}

export function toGracePeriod(row: OrganizationMfaGracePeriodRow): OrganizationMfaGracePeriod {
  return {
    organization_id: row.organization_id,
    uid: row.uid,
    reason: row.reason,
    started_at: toNumber(row.started_at),
    ends_at: toNumber(row.ends_at),
    notified_at: toNullableNumber(row.notified_at),
  };
}
