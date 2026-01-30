import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";
import type { OrganizationInvitationDefinition } from "./organization-invitation-definition";

export type OrganizationInvitationsTable = OrganizationInvitationDefinition;

export type OrganizationInvitationRow = Selectable<OrganizationInvitationsTable>;
export type NewOrganizationInvitationRow = Insertable<OrganizationInvitationsTable>;
export type OrganizationInvitationRowUpdate = Updateable<OrganizationInvitationsTable>;
