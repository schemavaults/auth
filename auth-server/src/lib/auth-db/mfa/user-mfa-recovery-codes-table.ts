import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";

export interface UserMfaRecoveryCodesTable {
  code_id: string;
  uid: string;
  code_hash: string;
  created_at: number;
  used_at: number | null;
}

export type UserMfaRecoveryCodeRow = Selectable<UserMfaRecoveryCodesTable>;
export type NewUserMfaRecoveryCodeRow = Insertable<UserMfaRecoveryCodesTable>;
export type UserMfaRecoveryCodeRowUpdate =
  Updateable<UserMfaRecoveryCodesTable>;
