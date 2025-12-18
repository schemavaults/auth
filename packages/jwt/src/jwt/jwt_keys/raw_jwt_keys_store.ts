import isValidBase64UrlEncoding from "@/utils/isValidBase64UrlEncoding";
import PEMFormat from "./pem-format";
import { base64url } from "jose";
import {
  jsonSerializedJwtKeySchema,
  type JsonSerializedJwtKey,
} from "./JsonSerializedJwtKey";
import isValidUuid from "@/utils/isValidUuid";
import { apiServerIdSchema } from "@schemavaults/app-definitions";

export interface IInitRawJwtKeysStoreOptions {
  audience_id: string;
  keyset_id: string;
  keyset_expiry: number;

  // Keys
  encryption?: JsonSerializedJwtKey;
  decryption: JsonSerializedJwtKey;
  signing?: JsonSerializedJwtKey;
  verification: JsonSerializedJwtKey;

  // Flags that allow better validation (resource servers dont need signing)
  is_auth_server?: boolean;
}

class Raw_JWT_Keys_Store {
  public readonly audience_id: string;
  public readonly keyset_id: string;
  private readonly is_auth_server: boolean;
  public readonly keyset_expiry: number;

  // Keys for encryption/decryption (JWE)
  private readonly _raw_encryption_key: string | null;
  private readonly _raw_decryption_key: string;

  // Keys for signing/verification (JWS)
  private readonly _raw_signing_key: string | null;
  private readonly _raw_verification_key: string;

  // Parses the IKeyInitFormat into 'pem' format
  private static parseKeyValue(key: JsonSerializedJwtKey): string {
    const parsed_key = jsonSerializedJwtKeySchema.safeParse(key);
    if (!parsed_key.success) {
      console.error(
        "Invalid key to save within Raw_Jwt_Keys_Store:",
        parsed_key.error,
      );
      throw new TypeError("Invalid key to save within Raw_Jwt_Keys_Store!");
    }

    if (key.format === "pem") {
      if (
        !PEMFormat.isPemFormat(
          key.value,
          key.privacy_level === "private" ? "PRIVATE" : "PUBLIC",
        )
      ) {
        throw new TypeError("Invalid PEM format for key!");
      }

      return key.value;
    } else if (key.format === "base64url") {
      if (!isValidBase64UrlEncoding(key.value)) {
        throw new TypeError("Invalid base64url format for key!");
      }

      const utf8_key_value: string = Buffer.from(
        key.value,
        "base64url",
      ).toString("utf8");
      return Raw_JWT_Keys_Store.parseKeyValue({
        format: "pem",
        value: utf8_key_value,
        privacy_level: key.privacy_level,
        key_type: key.key_type,
        keyset_id: key.keyset_id,
        audience_id: key.audience_id,
      });
    } else {
      throw new Error(
        "Invalid key format. Expected either 'pem' or 'base64url'",
      );
    }
  }

  private static encodeBase64Url(key: string): string {
    return base64url.encode(key);
  }

  public constructor({
    audience_id,
    keyset_id,
    keyset_expiry,
    encryption,
    decryption,
    signing,
    verification,
    is_auth_server,
  }: IInitRawJwtKeysStoreOptions) {
    // Validate keyset ID
    if (!isValidUuid(keyset_id)) {
      throw new TypeError("Expected 'keyset_id' to be a valid UUID!");
    }
    this.keyset_id = keyset_id;

    // Validate audience ID
    if (
      typeof audience_id !== "string" ||
      !apiServerIdSchema.safeParse(audience_id).success
    ) {
      throw new TypeError(
        "Expected 'audience_id' to be a valid API server ID!",
      );
    }
    this.audience_id = audience_id;

    if (typeof keyset_expiry !== "number" || isNaN(keyset_expiry)) {
      // Validate keyset expiry time
      throw new TypeError("Expected 'keyset_expiry' to be a number!");
    }
    this.keyset_expiry = keyset_expiry;

    // Parse keys from options
    this._raw_encryption_key = encryption?.value
      ? Raw_JWT_Keys_Store.parseKeyValue(encryption)
      : null;
    this._raw_decryption_key = Raw_JWT_Keys_Store.parseKeyValue(decryption);
    this._raw_signing_key = signing?.value
      ? Raw_JWT_Keys_Store.parseKeyValue(signing)
      : null;
    this._raw_verification_key = Raw_JWT_Keys_Store.parseKeyValue(verification);

    // Enable auth server mode if specified (throws if missing signing/encryption keys)
    this.is_auth_server = is_auth_server || false;
    if (this.is_auth_server) {
      // Signing & Encryption Keys are required for the auth server
      if (!this._raw_encryption_key || !this._raw_signing_key) {
        throw new Error("Missing required key(s) for auth server");
      }
    }

    // Throw if decryption or verifier are missing (always required)
    if (!this._raw_decryption_key) {
      throw new Error("Decryption key must always be present!");
    } else if (!this._raw_verification_key) {
      throw new Error("Verifier key must always be present!");
    }
  }

  // Returns the PEM-encoded encryption key, if stored
  public get encryption(): string | null {
    return this._raw_encryption_key ?? null;
  }

  // Returns the PEM-encoded decryption key
  public get decryption(): string {
    return this._raw_decryption_key;
  }

  // Returns the PEM-encoded signing key, if stored
  public get signing(): string | null {
    return this._raw_signing_key;
  }

  // Returns the PEM-encoded verification key
  public get verification(): string {
    return this._raw_verification_key;
  }

  public get encryption_base64url(): string | null {
    return this.encryption
      ? Raw_JWT_Keys_Store.encodeBase64Url(this.encryption)
      : null;
  }

  public get decryption_base64url(): string {
    return Raw_JWT_Keys_Store.encodeBase64Url(this.decryption);
  }

  public get verification_base64url(): string {
    return Raw_JWT_Keys_Store.encodeBase64Url(this.verification);
  }

  public get signing_base64url(): string | null {
    return this.signing
      ? Raw_JWT_Keys_Store.encodeBase64Url(this.signing)
      : null;
  }

  public get encryption_json(): JsonSerializedJwtKey | null {
    const value: string | null = this.encryption;
    if (!value) {
      return null;
    }
    return {
      format: "pem",
      value,
      privacy_level: "public",
      key_type: "encryption",
      keyset_id: this.keyset_id,
      audience_id: this.audience_id,
    };
  }

  public get decryption_json(): JsonSerializedJwtKey {
    const value: string = this.decryption;
    return {
      format: "pem",
      value,
      privacy_level: "public",
      key_type: "decryption",
      keyset_id: this.keyset_id,
      audience_id: this.audience_id,
    };
  }

  public get signing_json(): JsonSerializedJwtKey | null {
    const value: string | null = this.signing;
    if (!value) {
      return null;
    }
    return {
      format: "pem",
      value,
      privacy_level: "private",
      key_type: "signing",
      keyset_id: this.keyset_id,
      audience_id: this.audience_id,
    };
  }

  public get verification_json(): JsonSerializedJwtKey {
    const value: string = this.verification;
    return {
      format: "pem",
      value,
      privacy_level: "public",
      key_type: "verification",
      keyset_id: this.keyset_id,
      audience_id: this.audience_id,
    };
  }

  public listSerializedKeys(): readonly JsonSerializedJwtKey[] {
    const keys: JsonSerializedJwtKey[] = [
      this.decryption_json,
      this.verification_json,
    ];
    if (this.encryption) {
      keys.push(this.encryption_json!);
    }
    if (this.signing) {
      keys.push(this.signing_json!);
    }
    return keys;
  }
}

export default Raw_JWT_Keys_Store;
