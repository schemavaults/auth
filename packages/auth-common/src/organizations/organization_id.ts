// Organization ID validation moved to @schemavaults/app-definitions so the
// env-driven owner-organization getter can validate without a circular
// dependency; re-exported here to keep this package's public API unchanged.
export {
  organizationIdSchema,
  isValidOrganizationID,
  RESERVED_ORGANIZATION_IDS,
} from "@schemavaults/app-definitions";
export type { OrganizationID } from "@schemavaults/app-definitions";
