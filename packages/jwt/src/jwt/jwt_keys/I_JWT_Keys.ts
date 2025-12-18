import type { JsonSerializedJwtKey } from "./JsonSerializedJwtKey";

export interface I_JWT_Keys {
  audience_id: string;
  keyset_id: string;

  keyset_expiry: number;

  signing_key: Promise<CryptoKey> | null;

  verification_key: Promise<CryptoKey>;

  encryption_key: Promise<CryptoKey> | null;
  decryption_key: Promise<CryptoKey>;

  listSerializedKeys(): readonly JsonSerializedJwtKey[];
}
