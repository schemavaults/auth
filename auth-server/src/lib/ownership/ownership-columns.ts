import "server-only";

import {
  isResourceOwnerType,
  resolveResourceOwnership,
  type ResourceOwnerType,
  type ResourceOwnership,
  type ResourceOwnershipFields,
} from "@schemavaults/app-definitions";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";

export interface OwnershipDatabaseColumns {
  owner_type: ResourceOwnerType;
  owner_organization_id: string | null;
  owner_uid: string | null;
}

/**
 * @description Maps a resolved ownership onto the APPS / API_SERVERS
 * ownership columns. Platform ownership is stored with a NULL
 * `owner_organization_id` so that changing the configured owner
 * organization re-homes platform rows automatically.
 */
export function toOwnershipDatabaseColumns(
  ownership: ResourceOwnership,
): OwnershipDatabaseColumns {
  switch (ownership.owner_type) {
    case "platform":
      return { owner_type: "platform", owner_organization_id: null, owner_uid: null };
    case "organization":
      return {
        owner_type: "organization",
        owner_organization_id: ownership.owner_organization_id,
        owner_uid: null,
      };
    case "user":
      return {
        owner_type: "user",
        owner_organization_id: null,
        owner_uid: ownership.owner_uid,
      };
  }
}

/**
 * @description Reads the ownership columns of an APPS / API_SERVERS row and
 * returns the API-facing ownership fields: `owner_type` is always populated,
 * platform-owned rows report the deployment's virtual owner organization as
 * their `owner_organization_id`, and user-owned rows carry their
 * `owner_uid`.
 *
 * Rows written before migration 00037 (no `owner_type`) are interpreted the
 * legacy way (NULL owner organization → platform-owned).
 */
export function ownershipFieldsFromDatabaseRow(
  row: object,
): Required<Pick<ResourceOwnershipFields, "owner_type" | "owner_organization_id" | "owner_uid" | "created_by">> {
  const raw_owner_type: unknown =
    "owner_type" in row ? (row as { owner_type: unknown }).owner_type : undefined;
  const raw_owner_organization_id: unknown =
    "owner_organization_id" in row
      ? (row as { owner_organization_id: unknown }).owner_organization_id
      : undefined;
  const raw_owner_uid: unknown =
    "owner_uid" in row ? (row as { owner_uid: unknown }).owner_uid : undefined;
  const raw_created_by: unknown =
    "created_by" in row ? (row as { created_by: unknown }).created_by : undefined;

  const ownership: ResourceOwnership = resolveResourceOwnership(
    {
      owner_type: isResourceOwnerType(raw_owner_type) ? raw_owner_type : undefined,
      owner_organization_id:
        typeof raw_owner_organization_id === "string"
          ? raw_owner_organization_id
          : null,
      owner_uid: typeof raw_owner_uid === "string" ? raw_owner_uid : null,
    },
    { platform_owner_organization_id: getAuthServerOwnerOrganizationId() },
  );

  return {
    owner_type: ownership.owner_type,
    owner_organization_id: ownership.owner_organization_id,
    owner_uid: ownership.owner_uid,
    created_by: typeof raw_created_by === "string" ? raw_created_by : null,
  };
}
