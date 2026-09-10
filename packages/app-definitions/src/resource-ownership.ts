import { z } from "zod";
import { getAuthServerOwnerOrganizationId } from "./get-auth-server-owner-organization-id";
import type { OrganizationID } from "./organization-id";

/**
 * Who owns a client application or API server declaration.
 *
 * - `platform`: owned by the auth server deployment itself. Managed only by
 *   global admins. Stored with a NULL `owner_organization_id` and NULL
 *   `owner_uid`; the definition exposed by the API reports the deployment's
 *   virtual owner organization (`getAuthServerOwnerOrganizationId()`) as its
 *   `owner_organization_id` for backwards compatibility.
 * - `organization`: owned by an organization; managed by that organization's
 *   owners/admins, viewable by its members.
 * - `user`: owned directly by a single user account, independent of any
 *   organization membership; managed only by that user (and global admins).
 *   This is the ownership mode that dynamic client registration builds on.
 */
export const RESOURCE_OWNER_TYPES = [
  "platform",
  "organization",
  "user",
] as const satisfies readonly string[];

export type ResourceOwnerType = (typeof RESOURCE_OWNER_TYPES)[number];

export const resourceOwnerTypeSchema = z.enum(RESOURCE_OWNER_TYPES);

export function isResourceOwnerType(value: unknown): value is ResourceOwnerType {
  return resourceOwnerTypeSchema.safeParse(value).success;
}

/**
 * Ownership-related fields shared by the client application and API server
 * definition schemas. Every field is optional on the wire so that older
 * clients (which only know `owner_organization_id`) keep working; use
 * {@link resolveResourceOwnership} to read a definition's ownership rather
 * than inspecting these fields directly.
 */
export const resourceOwnershipFieldsShape = {
  owner_type: resourceOwnerTypeSchema.optional(),
  owner_organization_id: z.string().nullable().optional(),
  owner_uid: z.guid().nullable().optional(),
  /**
   * The user that created the declaration (audit trail only — never used
   * for authorization). `null` when the creator is unknown or deleted.
   */
  created_by: z.guid().nullable().optional(),
} as const;

export const resourceOwnershipFieldsSchema = z.object(
  resourceOwnershipFieldsShape,
);

export type ResourceOwnershipFields = z.infer<
  typeof resourceOwnershipFieldsSchema
>;

/**
 * A fully-resolved ownership assignment: exactly one owner kind, with the
 * identifying id of that owner.
 */
export type ResourceOwnership =
  | {
      owner_type: "platform";
      /** The deployment's virtual owner organization id. */
      owner_organization_id: OrganizationID;
      owner_uid: null;
    }
  | {
      owner_type: "organization";
      owner_organization_id: string;
      owner_uid: null;
    }
  | {
      owner_type: "user";
      owner_organization_id: null;
      owner_uid: string;
    };

/**
 * The ownership a caller asks for when creating a new app/API server.
 */
export type RequestedResourceOwnership =
  | { owner_type: "platform" }
  | { owner_type: "organization"; owner_organization_id: string }
  | { owner_type: "user"; owner_uid: string };

export interface ResolveResourceOwnershipOptions {
  /**
   * The id of the virtual organization that represents the platform. Defaults
   * to `getAuthServerOwnerOrganizationId()`; pass the value from the
   * `useAuthUiOwnerOrganizationId()` context in browser code, where the env
   * var is not available.
   */
  platform_owner_organization_id?: string;
}

/**
 * @description Resolves the ownership of an app or API server definition.
 *
 * An explicit `owner_type` always wins. Definitions produced before the
 * `owner_type` column existed are interpreted the legacy way: an
 * `owner_uid` means user-owned, an `owner_organization_id` other than the
 * platform's virtual organization means organization-owned, and anything
 * else (a missing/NULL owner organization, or the platform organization
 * itself) is platform-owned.
 *
 * @throws TypeError when an explicit `owner_type` is inconsistent with the
 * owner id fields (e.g. `owner_type: "user"` without an `owner_uid`).
 */
export function resolveResourceOwnership(
  definition: ResourceOwnershipFields,
  opts: ResolveResourceOwnershipOptions = {},
): ResourceOwnership {
  const platformOrganizationId: string =
    opts.platform_owner_organization_id ?? getAuthServerOwnerOrganizationId();

  const owner_organization_id: string | null =
    typeof definition.owner_organization_id === "string" &&
    definition.owner_organization_id.length > 0
      ? definition.owner_organization_id
      : null;
  const owner_uid: string | null =
    typeof definition.owner_uid === "string" && definition.owner_uid.length > 0
      ? definition.owner_uid
      : null;

  let owner_type: ResourceOwnerType;
  if (typeof definition.owner_type === "string") {
    if (!isResourceOwnerType(definition.owner_type)) {
      throw new TypeError(
        `Unknown resource owner type: '${String(definition.owner_type)}'`,
      );
    }
    owner_type = definition.owner_type;
  } else if (owner_uid) {
    owner_type = "user";
  } else if (
    owner_organization_id &&
    owner_organization_id !== platformOrganizationId
  ) {
    owner_type = "organization";
  } else {
    owner_type = "platform";
  }

  switch (owner_type) {
    case "platform":
      if (owner_uid) {
        throw new TypeError(
          "A platform-owned resource must not declare an 'owner_uid'",
        );
      }
      if (
        owner_organization_id &&
        owner_organization_id !== platformOrganizationId
      ) {
        throw new TypeError(
          "A platform-owned resource must not declare an owner organization other than the platform's own organization",
        );
      }
      return {
        owner_type: "platform",
        owner_organization_id: platformOrganizationId as OrganizationID,
        owner_uid: null,
      };
    case "organization":
      if (!owner_organization_id) {
        throw new TypeError(
          "An organization-owned resource must declare an 'owner_organization_id'",
        );
      }
      if (owner_uid) {
        throw new TypeError(
          "An organization-owned resource must not declare an 'owner_uid'",
        );
      }
      return {
        owner_type: "organization",
        owner_organization_id,
        owner_uid: null,
      };
    case "user":
      if (!owner_uid) {
        throw new TypeError("A user-owned resource must declare an 'owner_uid'");
      }
      if (owner_organization_id) {
        throw new TypeError(
          "A user-owned resource must not declare an 'owner_organization_id'",
        );
      }
      return {
        owner_type: "user",
        owner_organization_id: null,
        owner_uid,
      };
  }
}

/**
 * @description Convenience predicate: is the definition owned by the platform
 * (i.e. the auth server deployment itself)?
 */
export function isPlatformOwnedResource(
  definition: ResourceOwnershipFields,
  opts?: ResolveResourceOwnershipOptions,
): boolean {
  return resolveResourceOwnership(definition, opts).owner_type === "platform";
}

/**
 * @description Convenience predicate: is the definition owned directly by a
 * user account (rather than by an organization or the platform)?
 */
export function isUserOwnedResource(
  definition: ResourceOwnershipFields,
  opts?: ResolveResourceOwnershipOptions,
): boolean {
  return resolveResourceOwnership(definition, opts).owner_type === "user";
}

/**
 * @description Convenience predicate: is the definition owned by an
 * organization (other than the platform's virtual organization)?
 */
export function isOrganizationOwnedResource(
  definition: ResourceOwnershipFields,
  opts?: ResolveResourceOwnershipOptions,
): boolean {
  return (
    resolveResourceOwnership(definition, opts).owner_type === "organization"
  );
}

/**
 * @description Builds the ownership fields for a platform-owned definition
 * (used by the hardcoded app/API definitions and by admin create flows).
 */
export function platformOwnership(
  platform_owner_organization_id: string = getAuthServerOwnerOrganizationId(),
): ResourceOwnership & { owner_type: "platform" } {
  return {
    owner_type: "platform",
    owner_organization_id:
      platform_owner_organization_id as OrganizationID,
    owner_uid: null,
  };
}
