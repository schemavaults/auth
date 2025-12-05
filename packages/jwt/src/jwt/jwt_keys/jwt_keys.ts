import { importPKCS8, importSPKI, type KeyLike } from "jose";
import Raw_JWT_Keys_Store, { type IInitRawJwtKeysStoreOptions } from "./raw_jwt_keys_store";
import encryptDecryptAlg from "../encrypt_decrypt_alg";
import signingVerificationAlg from "../sign_verify_alg";

/**
 * @name JWT_Keys
 * @class
 * @description A class for interacting with JWT keys-- both encryption/decryption
 * @constructor JWT_Keys.init(...)
 * @hideconstructor
 */
export class JWT_Keys {
  public readonly raw_keys: Raw_JWT_Keys_Store;

  public constructor(raw_keys_or_opts: Raw_JWT_Keys_Store | IInitRawJwtKeysStoreOptions) {
    this.raw_keys = raw_keys_or_opts instanceof Raw_JWT_Keys_Store ? raw_keys_or_opts : new Raw_JWT_Keys_Store(raw_keys_or_opts)
  }

  public get signing_key(): Promise<KeyLike> | null {
    const raw_signing_key: string | null = this.raw_keys.signing
    if (!raw_signing_key) {
      return null;
    }
    return JWT_Keys.init_private_signing_crypto_key(raw_signing_key)
  }

  public get verifier_key(): Promise<KeyLike> {
    const raw_verifier_key: string = this.raw_keys.verification;
    return JWT_Keys.init_spki_public_verifier_key(raw_verifier_key);
  }

  private static async init_private_signing_crypto_key(
    pkcs8: string,
  ): Promise<KeyLike> {
    return await importPKCS8(
      pkcs8,
      signingVerificationAlg,
    ) satisfies KeyLike;
  }

  private static async init_spki_public_verifier_key(
    spki: string,
  ): Promise<KeyLike> {
    return await importSPKI(spki, signingVerificationAlg);
  }

  private static async init_decryption_key(
    pkcs8: string,
  ): Promise<KeyLike> {
    const initializedPkcs8EncryptionKey: KeyLike = await importPKCS8(
      pkcs8,
      encryptDecryptAlg,
    );
    return initializedPkcs8EncryptionKey;
  }

  private static async init_encryption_key(
    spki: string,
  ): Promise<KeyLike> {
    return await importSPKI(
      spki,
      encryptDecryptAlg,
    );
  }

  public get encryption_key(): Promise<KeyLike> | null {
    const raw_encryption_key: string | null = this.raw_keys.encryption;
    if (!raw_encryption_key) {
      return null;
    }
    return JWT_Keys.init_encryption_key(raw_encryption_key);
  }

  public get decryption_key(): Promise<KeyLike> {
    const raw_decryption_key: string = this.raw_keys.decryption;
    return JWT_Keys.init_decryption_key(raw_decryption_key);
  }

  public exportKeys(): Raw_JWT_Keys_Store {
    return this.raw_keys;
  }
}

export default JWT_Keys;
