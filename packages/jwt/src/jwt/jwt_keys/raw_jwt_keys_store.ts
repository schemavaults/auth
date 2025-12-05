import isValidBase64UrlEncoding from "@/utils/isValidBase64UrlEncoding";
import PEMFormat from "./pem-format";
import { base64url } from "jose";

export interface IKeyInitFormat<PrivacyLevel extends 'private' | 'public'> {
  value: string;
  format: "pem" | "base64url";
  privacyLevel: PrivacyLevel;
  name: 'encryption' | 'decryption' | 'signing' | 'verification';
}

export interface IInitRawJwtKeysStoreOptions {
  encryption?: IKeyInitFormat<'public'>;
  decryption: IKeyInitFormat<'private'>;
  signing?: IKeyInitFormat<'private'>;
  verification: IKeyInitFormat<'public'>;
  is_auth_server?: boolean;
}

class Raw_JWT_Keys_Store {
  private readonly is_auth_server: boolean;

  // Keys for encryption/decryption (JWE)
  private readonly _raw_encryption_key: string | null;
  private readonly _raw_decryption_key: string;

  // Keys for signing/verification (JWS)
  private readonly _raw_signing_key: string | null;
  private readonly _raw_verifier_key: string;

  // Parses the IKeyInitFormat into 'pem' format
  private static parseKeyValue(key: IKeyInitFormat<'private' | 'public'>): string {
    if (!key || typeof key !== 'object') {
      throw new TypeError("Expected an object");
    }

    if (typeof key.name !== 'string' || !['encryption', 'decryption', 'signing', 'verification'].includes(key.name)) {
      throw new TypeError('Invalid name for key!');
    }

    if (key.privacyLevel !== 'private' && key.privacyLevel !== 'public') {
      throw new TypeError('Invalid privacy level for key!');
    }

    if (key.format === 'pem') {
      if (!PEMFormat.isPemFormat(key.value, key.privacyLevel === 'private' ? "PRIVATE" : "PUBLIC")) {
        throw new TypeError('Invalid PEM format for key!');
      }

      return key.value;
    } else if (key.format === 'base64url') {
      if (!isValidBase64UrlEncoding(key.value)) {
        throw new TypeError('Invalid base64url format for key!');
      }

      const utf8_key_value: string = Buffer.from(key.value, 'base64url').toString('utf8');
      return Raw_JWT_Keys_Store.parseKeyValue({
        format: "pem",
        value: utf8_key_value,
        privacyLevel: key.privacyLevel,
        name: key.name
      });
    }

    throw new Error("Invalid key format. Expected either 'pem' or 'base64url'");
  }

  private static encodeBase64Url(key: string): string {
    return base64url.encode(key);
  }

  public constructor(
    { encryption, decryption, signing, verification, is_auth_server }: IInitRawJwtKeysStoreOptions
  ) {
    this._raw_encryption_key = encryption?.value ? Raw_JWT_Keys_Store.parseKeyValue(encryption) : null;
    this._raw_decryption_key = Raw_JWT_Keys_Store.parseKeyValue(decryption);
    this._raw_signing_key = signing?.value ? Raw_JWT_Keys_Store.parseKeyValue(signing) : null;
    this._raw_verifier_key = Raw_JWT_Keys_Store.parseKeyValue(verification);
    this.is_auth_server = is_auth_server || false;

    if (this.is_auth_server) {
      // Signing & Encryption Keys are required for the auth server
      if (!this._raw_encryption_key || !this._raw_signing_key) {
        throw new Error('Missing required key(s) for auth server');
      }
    }

    if (!this._raw_decryption_key) {
      throw new Error("Decryption key must always be present!")
    }
    if (!this._raw_verifier_key) {
      throw new Error("Verifier key must always be present!")
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
    return this._raw_verifier_key;
  }

  public get encryption_base64url(): string | null {
    return this.encryption ? Raw_JWT_Keys_Store.encodeBase64Url(this.encryption) : null;
  }

  public get decryption_base64url(): string {
    return Raw_JWT_Keys_Store.encodeBase64Url(this.decryption);
  }

  public get verification_base64url(): string {
    return Raw_JWT_Keys_Store.encodeBase64Url(this.verification);
  }

  public get signing_base64url(): string | null {
    return this.signing ? Raw_JWT_Keys_Store.encodeBase64Url(this.signing) : null;
  }
}

export default Raw_JWT_Keys_Store;
