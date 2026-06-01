import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";
import type { MfaFactorType } from "@schemavaults/auth-common";

export interface UserMfaFactorsTable {
  factor_id: string;
  uid: string;
  factor_type: MfaFactorType;
  // Nullable since the 00025 migration: TOTP factors store an AES-256-GCM
  // ciphertext secret here, but WebAuthn/passkey factors keep their
  // credential material (public key + counter) in user_webauthn_credentials
  // and have no symmetric secret.
  secret_ciphertext: string | null;
  kek_version: number | null;
  verified: boolean;
  created_at: number;
  verified_at: number | null;
  last_used_at: number | null;
}

export type UserMfaFactorRow = Selectable<UserMfaFactorsTable>;
export type NewUserMfaFactorRow = Insertable<UserMfaFactorsTable>;
export type UserMfaFactorRowUpdate = Updateable<UserMfaFactorsTable>;
