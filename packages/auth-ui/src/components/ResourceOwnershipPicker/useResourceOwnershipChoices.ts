"use client";

import { useMemo } from "react";
import {
  useCurrentUserWithRevalidation,
  useMyOrganizations,
} from "@schemavaults/auth-react-provider";
import { useAuthUiOwnerOrganizationId } from "@/components/OwnerOrganizationProvider";
import {
  computeResourceOwnershipChoices,
  type PreferredResourceOwnership,
  type ResourceOwnershipChoices,
  type ResourceOwnershipOrganizationChoice,
} from "./resource-ownership-choices";

/**
 * What a create dialog needs to know to offer the right owners: which owner
 * to preselect, and the page-level facts the browser cannot look up on its
 * own.
 */
export interface CreateResourceOwnershipOptions {
  /**
   * The owner preselected when the dialog opens (see
   * `preferredResourceOwnershipForList()`); the viewer can pick another.
   */
  defaultOwnership: PreferredResourceOwnership;
  /**
   * Whether the viewer may create personal (user-owned) resources: the
   * `allow_user_owned_resource_creation` server setting (default true;
   * global admins are always allowed). The server enforces it regardless.
   */
  allowPersonal?: boolean;
  /**
   * The organization the dialog was opened for, offered even when the
   * viewer is not a member of it (global admins on an organization page).
   * Only pass it when the viewer may manage that organization.
   */
  contextOrganization?: ResourceOwnershipOrganizationChoice;
}

export interface UseResourceOwnershipChoicesResult {
  choices: ResourceOwnershipChoices;
  /** The viewer's user id (`null` while unknown). */
  currentUserUid: string | null;
}

/**
 * @description The owners the current viewer may pick for a new app / API
 * server: reads their admin flag, user id and organization memberships
 * (`useMyOrganizations()`, fetched only while `enabled`).
 */
export function useResourceOwnershipChoices(
  options: Omit<CreateResourceOwnershipOptions, "defaultOwnership">,
  { enabled = true }: { enabled?: boolean } = {},
): UseResourceOwnershipChoicesResult {
  const currentUser = useCurrentUserWithRevalidation();
  const platformOrganizationId: string = useAuthUiOwnerOrganizationId();
  const memberships = useMyOrganizations({ enabled });
  const currentUserUid: string | null = currentUser?.uid ?? null;
  const isGlobalAdmin: boolean = currentUser?.admin === true;
  const allowPersonal: boolean = options.allowPersonal ?? true;
  const contextOrganizationId: string | undefined =
    options.contextOrganization?.organization_id;
  const contextOrganizationName: string | null | undefined =
    options.contextOrganization?.organization_name;

  const choices = useMemo(
    (): ResourceOwnershipChoices =>
      computeResourceOwnershipChoices({
        isGlobalAdmin,
        currentUserUid,
        allowPersonal,
        memberships: memberships.data,
        // Until the first response (including while the auth client is not
        // ready yet, when SWR has not started fetching), treat the
        // memberships as loading rather than empty.
        membershipsLoading: !memberships.data && !memberships.error,
        membershipsError: !!memberships.error,
        platformOrganizationId,
        contextOrganization: contextOrganizationId
          ? {
              organization_id: contextOrganizationId,
              organization_name: contextOrganizationName ?? null,
            }
          : undefined,
      }),
    [
      isGlobalAdmin,
      currentUserUid,
      allowPersonal,
      memberships.data,
      memberships.error,
      platformOrganizationId,
      contextOrganizationId,
      contextOrganizationName,
    ],
  );

  return { choices, currentUserUid };
}

export default useResourceOwnershipChoices;
