import type { InviteCodeDefinition } from "@schemavaults/auth-common";

import {
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export type InviteCodesTable = InviteCodeDefinition;

export type InviteCodeRow = Selectable<InviteCodesTable>;
export type NewInviteCodeRow = Insertable<InviteCodesTable>;
export type InviteCodeRowUpdate = Updateable<InviteCodesTable>;
