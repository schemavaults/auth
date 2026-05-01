import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";
import type { MfaFactorType } from "@schemavaults/auth-common";

export interface UserMfaFactorsTable {
  factor_id: string;
  uid: string;
  factor_type: MfaFactorType;
  secret_ciphertext: string;
  kek_version: number;
  verified: boolean;
  created_at: number;
  verified_at: number | null;
  last_used_at: number | null;
}

export type UserMfaFactorRow = Selectable<UserMfaFactorsTable>;
export type NewUserMfaFactorRow = Insertable<UserMfaFactorsTable>;
export type UserMfaFactorRowUpdate = Updateable<UserMfaFactorsTable>;
