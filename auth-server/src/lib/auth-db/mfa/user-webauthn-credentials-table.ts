import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";

// Companion table to user_mfa_factors for factors of type 'webauthn'. Each
// row holds the public-key credential material for one passkey, keyed 1:1 to
// its factor row (factor_id PK + ON DELETE CASCADE). Created by the 00025
// migration.
//
// `credential_id` and `public_key` are stored base64url-encoded. `counter`
// is the WebAuthn signature counter used to detect cloned authenticators; it
// is bumped on every successful assertion. The remaining columns are
// advisory metadata returned by @simplewebauthn during registration.
export interface UserWebauthnCredentialsTable {
  factor_id: string;
  uid: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  aaguid: string | null;
  device_type: string | null;
  backed_up: boolean | null;
  label: string | null;
  created_at: number;
}

export type UserWebauthnCredentialRow =
  Selectable<UserWebauthnCredentialsTable>;
export type NewUserWebauthnCredentialRow =
  Insertable<UserWebauthnCredentialsTable>;
export type UserWebauthnCredentialRowUpdate =
  Updateable<UserWebauthnCredentialsTable>;
