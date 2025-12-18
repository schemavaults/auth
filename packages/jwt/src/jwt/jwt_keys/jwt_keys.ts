import { importPKCS8, importSPKI, type CryptoKey } from "jose";
import Raw_JWT_Keys_Store, {
  type IInitRawJwtKeysStoreOptions,
} from "./raw_jwt_keys_store";
import encryptDecryptAlg from "../encrypt_decrypt_alg";
import signingVerificationAlg from "../sign_verify_alg";
import type { JsonSerializedJwtKey } from "./JsonSerializedJwtKey";
import type { I_JWT_Keys } from "./I_JWT_Keys";

/**
 * @name JWT_Keys
 * @class
 * @description A class for interacting with JWT keys-- both encryption/decryption
 * @constructor JWT_Keys.init(...)
 * @hideconstructor
 */
export class JWT_Keys implements I_JWT_Keys {
  public get audience_id(): string {
    const audience_id: string = this.raw_keys.audience_id;
    if (typeof audience_id !== "string") {
      throw new Error("Expected 'audience_id' to be a string!");
    }
    return audience_id;
  }

  public get keyset_id(): string {
    return this.raw_keys.keyset_id;
  }

  public get keyset_expiry(): number {
    return this.raw_keys.keyset_expiry;
  }

  public readonly raw_keys: Raw_JWT_Keys_Store;

  public constructor(
    raw_keys_or_opts: Raw_JWT_Keys_Store | IInitRawJwtKeysStoreOptions,
  ) {
    this.raw_keys =
      raw_keys_or_opts instanceof Raw_JWT_Keys_Store
        ? raw_keys_or_opts
        : new Raw_JWT_Keys_Store(raw_keys_or_opts);
  }

  public get signing_key(): Promise<CryptoKey> | null {
    const raw_signing_key: string | null = this.raw_keys.signing;
    if (!raw_signing_key) {
      return null;
    }
    return JWT_Keys.init_private_signing_crypto_key(raw_signing_key);
  }

  public get verification_key(): Promise<CryptoKey> {
    const raw_verifier_key: string = this.raw_keys.verification;
    return JWT_Keys.init_spki_public_verification_key(raw_verifier_key);
  }

  private static async init_private_signing_crypto_key(
    pkcs8: string,
  ): Promise<CryptoKey> {
    return (await importPKCS8(pkcs8, signingVerificationAlg, {
      extractable: true,
    })) satisfies CryptoKey;
  }

  private static async init_spki_public_verification_key(
    spki: string,
  ): Promise<CryptoKey> {
    return await importSPKI(spki, signingVerificationAlg, {
      extractable: true,
    });
  }

  private static async init_decryption_key(pkcs8: string): Promise<CryptoKey> {
    const initializedPkcs8EncryptionKey: CryptoKey = await importPKCS8(
      pkcs8,
      encryptDecryptAlg,
      {
        extractable: true,
      },
    );
    return initializedPkcs8EncryptionKey;
  }

  private static async init_encryption_key(spki: string): Promise<CryptoKey> {
    return await importSPKI(spki, encryptDecryptAlg, {
      extractable: true,
    });
  }

  public get encryption_key(): Promise<CryptoKey> | null {
    const raw_encryption_key: string | null = this.raw_keys.encryption;
    if (!raw_encryption_key) {
      return null;
    }
    return JWT_Keys.init_encryption_key(raw_encryption_key);
  }

  public get decryption_key(): Promise<CryptoKey> {
    const raw_decryption_key: string = this.raw_keys.decryption;
    return JWT_Keys.init_decryption_key(raw_decryption_key);
  }

  public exportKeys(): Raw_JWT_Keys_Store {
    return this.raw_keys;
  }

  public listSerializedKeys(): readonly JsonSerializedJwtKey[] {
    return this.exportKeys().listSerializedKeys();
  }
}

export default JWT_Keys;
