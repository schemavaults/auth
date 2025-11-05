import type { InviteCodeDefinition } from "@schemavaults/auth";

import {
  ColumnType,
  Generated,
  Insertable,
  JSONColumnType,
  Selectable,
  Updateable,
} from "kysely";

export type InviteCodesTable = InviteCodeDefinition;

export type InviteCodeRow = Selectable<InviteCodesTable>;
export type NewInviteCodeRow = Insertable<InviteCodesTable>;
export type InviteCodeRowUpdate = Updateable<InviteCodesTable>;
