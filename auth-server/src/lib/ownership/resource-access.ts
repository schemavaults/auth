import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  resolveResourceOwnership,
  type ResourceOwnership,
  type ResourceOwnershipFields,
} from "@schemavaults/app-definitions";
import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import { isUserInOrganization } from "@/lib/isUserInOrganization";
import type { OrganizationMembershipRoleType } from "@/lib/auth-db/organizations";

/**
 * How much a user may do with an owned resource (a client application or an
 * API server declaration), ordered from least to most privileged.
 *
 * - `none`: no relationship with the owner.
 * - `member`: may view the resource (organization member).
 * - `admin`: may manage its configuration (organization admin).
 * - `owner`: may additionally delete it and connect it to other resources
 *   (organization owner, the owning user of a user-owned resource, or a
 *   global admin for anything).
 */
export const OWNED_RESOURCE_ACCESS_LEVELS = [
  "none",
  "member",
  "admin",
  "owner",
] as const;

export type OwnedResourceAccessLevel =
  (typeof OWNED_RESOURCE_ACCESS_LEVELS)[number];

const LEVEL_RANK: Record<OwnedResourceAccessLevel, number> = {
  none: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function accessLevelSatisfies(
  level: OwnedResourceAccessLevel,
  minimum: Exclude<OwnedResourceAccessLevel, "none">,
): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minimum];
}

function accessLevelForOrganizationRole(
  role: OrganizationMembershipRoleType | false,
): OwnedResourceAccessLevel {
  switch (role) {
    case "owner":
      return "owner";
    case "admin":
      return "admin";
    case "member":
      return "member";
    default:
      return "none";
  }
}

/**
 * @description Resolves how much `user` may do with a resource that has the
 * given ownership. Global admins always get `owner` access. Platform-owned
 * resources are reachable only by global admins; organization-owned
 * resources map the user's organization role onto the access level; and
 * user-owned resources grant `owner` access to the owning user only.
 */
export async function getUserAccessLevelForOwnership(
  db: Kysely<AuthDatabase>,
  user: UserData,
  ownership: ResourceOwnership,
): Promise<OwnedResourceAccessLevel> {
  if (user.admin === true) {
    return "owner";
  }
  switch (ownership.owner_type) {
    case "platform":
      return "none";
    case "user":
      return ownership.owner_uid === user.uid ? "owner" : "none";
    case "organization": {
      const role = await isUserInOrganization(
        db,
        user,
        ownership.owner_organization_id as OrganizationID,
      );
      return accessLevelForOrganizationRole(role);
    }
  }
}

/**
 * @description Convenience wrapper over {@link getUserAccessLevelForOwnership}
 * that resolves the ownership from an app/API server definition first.
 */
export async function getUserAccessLevelForResource(
  db: Kysely<AuthDatabase>,
  user: UserData,
  resource: ResourceOwnershipFields,
): Promise<OwnedResourceAccessLevel> {
  return await getUserAccessLevelForOwnership(
    db,
    user,
    resolveResourceOwnership(resource),
  );
}

/**
 * @description Whether the user may see the resource: public resources are
 * visible to everyone, private ones to organization members and up.
 */
export async function canUserViewResource(
  db: Kysely<AuthDatabase>,
  user: UserData,
  resource: ResourceOwnershipFields & { public?: boolean },
): Promise<boolean> {
  if (resource.public === true) {
    return true;
  }
  const level = await getUserAccessLevelForResource(db, user, resource);
  return accessLevelSatisfies(level, "member");
}

/**
 * @description Whether the user may change the resource's configuration
 * (domains, callback URLs, client secrets, access keys): organization
 * owners/admins, the owning user, or global admins.
 */
export async function canUserManageResource(
  db: Kysely<AuthDatabase>,
  user: UserData,
  resource: ResourceOwnershipFields,
): Promise<boolean> {
  const level = await getUserAccessLevelForResource(db, user, resource);
  return accessLevelSatisfies(level, "admin");
}

/**
 * @description Whether the user fully owns the resource (may delete it or
 * connect it to other resources): organization owners, the owning user, or
 * global admins.
 */
export async function isUserOwnerOfResource(
  db: Kysely<AuthDatabase>,
  user: UserData,
  resource: ResourceOwnershipFields,
): Promise<boolean> {
  const level = await getUserAccessLevelForResource(db, user, resource);
  return accessLevelSatisfies(level, "owner");
}
