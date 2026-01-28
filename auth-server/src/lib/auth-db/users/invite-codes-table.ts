import type { InviteCodeDefinition } from "@schemavaults/auth-common";

import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";

export type InviteCodesTable = InviteCodeDefinition;

export type InviteCodeRow = Selectable<InviteCodesTable>;
export type NewInviteCodeRow = Insertable<InviteCodesTable>;
export type InviteCodeRowUpdate = Updateable<InviteCodesTable>;
