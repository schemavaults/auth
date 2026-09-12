"use client";

import type { ResourceOwnershipFields } from "@schemavaults/app-definitions";
import { useAdmin, useCurrentUser } from "@schemavaults/auth-react-provider";
import { useResolvedResourceOwnership } from "./ResourceOwnerLabel";

export interface UseCanManageListedResourceOptions {
  /** The app or API server definition rendered in the row. */
  resource: ResourceOwnershipFields;
  /**
   * The list query the row was loaded from: "all" (admin lists), "org"
   * (an organization page), "owned" (the viewer's own resources),
   * "accessible" (everything the viewer can reach), etc.
   */
  queryType: string | undefined;
  /**
   * On an organization page: whether the viewer is an owner/admin of that
   * organization (the card's `isOrgOwner` prop).
   */
  isOrgOwner?: boolean;
  /**
   * On an "accessible" list: the ids of the organizations in which the
   * viewer holds an owner/admin role, so organization-owned rows can be
   * gated without a round trip per row.
   */
  managedOrganizationIds?: readonly string[];
}

/**
 * @description Whether the viewer may manage (add domains to, delete, …) a
 * listed app / API server. Mirrors the server's ownership rules
 * (`canUserManageResource`): global admins always; the owning user of a
 * user-owned resource; owners/admins of the owning organization. The
 * server still enforces every action — this only decides which controls
 * to show.
 */
export function useCanManageListedResource({
  resource,
  queryType,
  isOrgOwner,
  managedOrganizationIds,
}: UseCanManageListedResourceOptions): boolean {
  const admin: boolean = useAdmin();
  const currentUser = useCurrentUser();
  const ownership = useResolvedResourceOwnership(resource);

  if (admin) {
    return true;
  }
  if (!ownership) {
    return false;
  }

  switch (queryType) {
    case "org":
      return !!isOrgOwner && ownership.owner_type === "organization";
    case "owned":
      return (
        ownership.owner_type === "user" &&
        !!currentUser &&
        ownership.owner_uid === currentUser.uid
      );
    case "accessible":
      switch (ownership.owner_type) {
        case "user":
          return !!currentUser && ownership.owner_uid === currentUser.uid;
        case "organization":
          return (
            !!managedOrganizationIds &&
            managedOrganizationIds.includes(ownership.owner_organization_id)
          );
        default:
          return false;
      }
    default:
      return false;
  }
}

export default useCanManageListedResource;
