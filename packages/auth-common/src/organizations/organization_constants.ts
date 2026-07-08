// The ID length limits moved to @schemavaults/app-definitions alongside
// organizationIdSchema; re-exported here to keep this package's public API unchanged.
export {
  MINIMUM_ORGANIZATION_ID_LENGTH,
  MAXIMUM_ORGANIZATION_ID_LENGTH,
} from "@schemavaults/app-definitions";

export const MINIMUM_ORGANIZATION_NAME_LENGTH = 1 as const satisfies number;
export const MAXIMUM_ORGANIZATION_NAME_LENGTH = 64 as const satisfies number;

export const MAXIMUM_USER_ORGANIZATIONS = 10 as const satisfies number;
