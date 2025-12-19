import type { JsonSerializedJwtKey } from "./JsonSerializedJwtKey";

export interface I_JWT_Keys {
  audience_id: string;
  keyset_id: string;

  keyset_expiry: number;

  signing_key: Promise<CryptoKey> | null;
  signing_key_json: JsonSerializedJwtKey | null;

  verification_key: Promise<CryptoKey>;
  verification_key_json: JsonSerializedJwtKey;

  encryption_key: Promise<CryptoKey> | null;
  encryption_key_json: JsonSerializedJwtKey | null;

  decryption_key: Promise<CryptoKey>;
  decryption_key_json: JsonSerializedJwtKey;

  listSerializedKeys(): readonly JsonSerializedJwtKey[];
}
