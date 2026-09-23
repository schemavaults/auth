import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { createOrganizationOperation, listAllOrganizations } from "@/app/api/organizations/operation";
import { deleteOrganization } from "@/app/api/organizations/[organization_id]/operation";
import { listOrganizationMembers } from "@/app/api/organizations/[organization_id]/members/operation";
import {
  getOrganizationMemberRole,
  updateOrganizationMemberRole,
} from "@/app/api/organizations/[organization_id]/members/[uid]/role/operation";
import {
  createOrganizationInvitationOperation,
  listOrganizationInvitationsOperation,
} from "@/app/api/organizations/[organization_id]/invitations/operation";
import {
  respondToOrganizationInvitation,
  revokeOrganizationInvitation,
} from "@/app/api/organizations/[organization_id]/invitations/[invitation_id]/operation";

/** Operations of the "organizations" domain, in the order they appear in the docs. */
export const organizationsOperations: readonly AnyOperationDefinition[] = [
  createOrganizationOperation,
  listAllOrganizations,
  deleteOrganization,
  listOrganizationMembers,
  getOrganizationMemberRole,
  updateOrganizationMemberRole,
  listOrganizationInvitationsOperation,
  createOrganizationInvitationOperation,
  respondToOrganizationInvitation,
  revokeOrganizationInvitation,
];
