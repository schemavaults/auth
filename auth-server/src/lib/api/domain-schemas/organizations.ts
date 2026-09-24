import {
  organizationIdSchema,
  organizationInvitationSchema,
  organizationMembershipRoleTypeSchema,
} from "@schemavaults/auth-common";
import { z, withOpenApi } from "@schemavaults/openapi-operations";

/**
 * Schemas shared by the "organizations" and "account" operations. Types
 * that only existed in TypeScript on the old route handlers
 * (`OrganizationInvitationWithUserData`, `OrganizationMemberWithUserData`)
 * get a zod equivalent here so the OpenAPI document can describe them.
 */

/** `{organization_id}` path parameter of every organization-scoped operation. */
export const organizationIdParams = z.object({
  organization_id: withOpenApi(organizationIdSchema, {
    description: "Organization id (URL-safe slug)",
    example: "acme-inc",
  }),
});

/** A membership role: `owner`, `member`, or the virtual `admin` role of platform administrators. */
export const OrganizationMembershipRole = withOpenApi(organizationMembershipRoleTypeSchema, {
  description:
    "Membership role in the organization: `owner`, `member`, or `admin` (the virtual role platform administrators hold in the owner organization).",
  example: "member",
});

/** An organization invitation row (`OrganizationInvitationDefinition`). */
export const OrganizationInvitation = withOpenApi(organizationInvitationSchema, "OrganizationInvitation", {
  description: "An invitation for a user to join an organization.",
});

/** An invitation as listed for organization owners: joined with both parties' e-mail addresses. */
export const OrganizationInvitationListEntry = organizationInvitationSchema
  .extend({
    invitee_email: z.email().openapi({ description: "E-mail address of the invited user" }),
    inviter_email: z.email().openapi({ description: "E-mail address of the inviting user" }),
  })
  .openapi("OrganizationInvitationListEntry");

/** A member of an organization joined with the user's account data (`OrganizationMemberWithUserData`). */
export const OrganizationMember = z
  .object({
    membership_declaration_id: z.string().openapi({ description: "Id of the membership row" }),
    organization_id: organizationIdSchema,
    uid: z.guid().openapi({ description: "The member's user id" }),
    role: OrganizationMembershipRole,
    membership_created_at: z.number().openapi({ description: "Unix epoch milliseconds the membership was created" }),
    email: z.email(),
    email_verified: z.boolean().optional(),
    admin: z.boolean().optional().openapi({ description: "Whether the member is a platform administrator" }),
    disabled: z.boolean().optional().openapi({ description: "Whether the member's account is disabled" }),
  })
  .openapi("OrganizationMember");
