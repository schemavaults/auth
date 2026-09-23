import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { listMyInvitations } from "@/app/api/me/invitations/operation";
import { listMyOrganizations } from "@/app/api/me/organizations/operation";
import { getMyOrganizationRole } from "@/app/api/me/organizations/[organization_id]/role/operation";
import { listUserOrganizations } from "@/app/api/user/organizations/operation";
import { getUserProfile, updateUserProfile } from "@/app/api/user/profile/operation";

/** Operations of the "account" domain, in the order they appear in the docs. */
export const accountOperations: readonly AnyOperationDefinition[] = [
  getUserProfile,
  updateUserProfile,
  listMyOrganizations,
  getMyOrganizationRole,
  listUserOrganizations,
  listMyInvitations,
];
