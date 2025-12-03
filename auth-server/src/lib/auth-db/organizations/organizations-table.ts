import type { OrganizationDefinition } from "@schemavaults/auth-common";
import type {
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export type OrganizationsTable = OrganizationDefinition;

export type OrganizationRow = Selectable<OrganizationsTable>;
export type NewOrganizationRow = Insertable<OrganizationsTable>;
export type OrganizationRowUpdate = Updateable<OrganizationsTable>;
