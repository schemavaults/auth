import { base64url, importPKCS8, importSPKI, type KeyLike } from "jose";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { SigningKeyPairFactory } from "./SigningKeyPairFactory";
import maybeStripQuotes from "@/utils/maybeStripQuotes";
import fromBase64UrlEncoded from "@/utils/fromBase64UrlEncoded";
import toBase64UrlEncoded from "@/utils/toBase64UrlEncoded";
import type {
  Initialize_JWT_Keys_Options,
  Initialize_JWT_Keys_Options_Base64UrlEncoded,
} from "./init-jwt-keys-instance-opts";
import { PEMFormat } from "./pem-format";
import isValidBase64UrlEncoding from "@/utils/isValidBase64UrlEncoding";
import { getDefaultDebugState } from "@/utils/getDefaultDebugState";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Encryption key
      PRIVATE_JWT_ENCRYPTION_SECRET?: string;
      // Decryption key
      PRIVATE_JWT_DECRYPTION_SECRET?: string;
      // Private signature signing key
      PRIVATE_JWT_SIGNING_SECRET?: string;
      // Public signature key, verifiy token['sig'] was signed by the private key above
      PUBLIC_JWT_SIGNING_VERIFIER?: string;
    }
  }
}

export const enum JWT_Keys_Env {
  PRIVATE_JWT_ENCRYPTION_SECRET = "PRIVATE_JWT_ENCRYPTION_SECRET",
  PRIVATE_JWT_DECRYPTION_SECRET = "PRIVATE_JWT_DECRYPTION_SECRET",
  PRIVATE_JWT_SIGNING_SECRET = "PRIVATE_JWT_SIGNING_SECRET",
  PUBLIC_JWT_SIGNING_VERIFIER = "PUBLIC_JWT_SIGNING_VERIFIER",
}

interface I_JWT_Keys_Constructor_Options {
  private_signing_secret_pkcs8?: string;
  public_signing_verifier_spki: string;
  encryption_secret?: string;
  decryption_secret?: string;
  private_signing_secret_key?: KeyLike;
  public_signing_verifier_key: KeyLike;
  debug?: boolean;
}

/**
 * @name JWT_Keys
 * @class
 * @description A class for interacting with JWT keys-- both encryption/decryptoon
 * @constructor JWT_Keys.init(...)
 * @hideconstructor
 */
export class JWT_Keys {
  private static readonly environment: SchemaVaultsAppEnvironment =
    getAppEnvironment();
  private readonly _encryption_secret: Uint8Array | null;
  private readonly _decryption_secret: Uint8Array;
  private readonly _raw_private_signing_secret_pkcs8: string | null = null;
  private readonly _private_signing_secret_key: KeyLike | null = null;
  private readonly _raw_public_signing_verifier_spki: string;
  private readonly _public_signing_verifier_key: KeyLike;
  private readonly _debug: boolean;

  private get debug(): boolean {
    return this._debug;
  }

  private get environment(): SchemaVaultsAppEnvironment {
    return JWT_Keys.environment;
  }

  /**
   * @name parseContentEncryptionKeyEnvVar
   * @param envVar A base64url-encoded string (usually from an environment variable)
   * @returns The data contained in the content encryption key as a byte array
   * @description Used to parse PRIVATE_JWT_ENCRYPTION_SECRET or PRIVATE_JWT_DECRYPTION_SECRET from process.env (not used for PKCS8/SPKI private/public signing key parsing!)
   */
  private static parseContentEncryptionKeyEnvVar(
    envVar: JWT_Keys_Env,
  ): Uint8Array {
    if (!process.env[envVar]) {
      throw new Error(`[JWT_Keys] Missing ${envVar} environment variable`);
    }
    let secret: Uint8Array;
    try {
      const secret_key_from_env = process.env[envVar];
      if (!secret_key_from_env) {
        throw new Error(`[JWT_Keys] Missing ${envVar} environment variable`);
      }
      secret = base64url.decode(secret_key_from_env);
    } catch (error) {
      console.error("[JWT_Keys]", error);
      throw new Error(`Error encoding ${envVar}`);
    }

    return secret;
  }

  private constructor(opts: I_JWT_Keys_Constructor_Options) {
    // Set debug state
    if (typeof opts?.debug === "boolean") {
      this._debug = opts.debug satisfies boolean; // a debug state was explicitly supplied
    } else {
      // a debug state was not explicitly set
      const defaultDebugState: boolean = getDefaultDebugState(
        JWT_Keys.environment,
      );
      this._debug = defaultDebugState;
    }

    if (this.debug) {
      console.log(
        `[JWT_Keys] Initializing JWT_Keys instance in debug mode from environment '${this.environment}' with options: `,
        opts,
      );
    }

    // Some apps (e.g. every not auth server) dont have signing secret set
    try {
      if (typeof opts?.encryption_secret === "string") {
        this._encryption_secret = base64url.decode(
          opts.encryption_secret,
        ) satisfies Uint8Array;
      } else {
        this._encryption_secret = JWT_Keys.parseContentEncryptionKeyEnvVar(
          JWT_Keys_Env.PRIVATE_JWT_ENCRYPTION_SECRET,
        );
      }
    } catch (e: unknown) {
      this._encryption_secret = null;
    }

    // Every env has decryption secret
    try {
      if (typeof opts?.decryption_secret === "string") {
        this._decryption_secret = base64url.decode(
          opts.decryption_secret,
        ) satisfies Uint8Array;
      } else {
        this._decryption_secret = JWT_Keys.parseContentEncryptionKeyEnvVar(
          JWT_Keys_Env.PRIVATE_JWT_DECRYPTION_SECRET,
        );
      }
      if (!this._decryption_secret) {
        throw new Error("This should be available in every environment!");
      }
    } catch (e: unknown) {
      throw new Error(
        `Failed to load env var: ${JWT_Keys_Env.PRIVATE_JWT_DECRYPTION_SECRET}!`,
      );
    }

    // Some apps (e.g. every not auth server) dont have signing secret set

    if (
      (!opts.private_signing_secret_pkcs8 &&
        !!opts.private_signing_secret_key) ||
      (opts.private_signing_secret_pkcs8 && !opts.private_signing_secret_key)
    ) {
      throw new Error(
        "Both a PKCS8 string and a KeyLike crypto-key representation must be passed, or neither at all!",
      );
    }

    try {
      if (
        !!opts?.private_signing_secret_pkcs8 &&
        typeof opts.private_signing_secret_pkcs8 === "string" &&
        !!opts?.private_signing_secret_key
      ) {
        this._raw_private_signing_secret_pkcs8 =
          opts.private_signing_secret_pkcs8 satisfies string;
        this._private_signing_secret_key = opts.private_signing_secret_key;
      }
    } catch (e: unknown) {
      this._raw_private_signing_secret_pkcs8 = null;
      this._private_signing_secret_key = null;
    }

    // Public 'sig' verifier should be available everywhere
    try {
      if (
        !!opts?.public_signing_verifier_key &&
        !!opts?.public_signing_verifier_spki
      ) {
        this._public_signing_verifier_key = opts.public_signing_verifier_key;
        this._raw_public_signing_verifier_spki =
          opts.public_signing_verifier_spki;
      } else {
        throw new Error(
          "Public JWT signing verifier key not passed as an option to JWT_Keys constructor!",
        );
      }
      if (
        !this._public_signing_verifier_key ||
        !this._raw_public_signing_verifier_spki
      ) {
        throw new Error(
          "Public JWT signing verifier should be set in every app!",
        );
      }
    } catch (e: unknown) {
      throw new Error(
        `Failed to load env var: ${JWT_Keys_Env.PUBLIC_JWT_SIGNING_VERIFIER}!`,
      );
    }
  }

  public get encryption_secret(): Uint8Array {
    if (!this._encryption_secret) {
      console.error(
        `Please set the encoding secret key at env var ${JWT_Keys_Env.PRIVATE_JWT_ENCRYPTION_SECRET}`,
      );
      throw new Error("[JWT_Keys] Missing encoding secret key");
    }
    return this._encryption_secret;
  }

  /**
   * @name encryption_secret_base64url
   * @see this.encryption_secret
   * @description this.encryption_secret Uint8Array as a base64url-encoded string
   */
  public get encryption_secret_base64url(): string {
    const encryption_secret: Uint8Array = this.encryption_secret;
    const encryption_secret_base64url: string = Buffer.from(encryption_secret)
      .toString("base64url")
      .trim();
    if (!isValidBase64UrlEncoding(encryption_secret_base64url)) {
      throw new Error(
        "'encryption_secret_base64url' getter returned invalid base64url-encoded encryption secret!",
      );
    }
    return encryption_secret_base64url;
  }

  public get decryption_secret(): Uint8Array {
    if (!this._decryption_secret) {
      console.error(
        `Please set the decoding secret key at env var: ${JWT_Keys_Env.PRIVATE_JWT_DECRYPTION_SECRET}`,
      );
      throw new Error("[JWT_Keys] Missing decoding secret key");
    }
    return this._decryption_secret;
  }

  /**
   * @name decryption_secret_base64url
   * @see this.decryption_secret
   * @description this.decryption_secret Uint8Array as a base64url-encoded string
   */
  public get decryption_secret_base64url(): string {
    const decryption_secret: Uint8Array = this.decryption_secret;
    const decryption_secret_base64url: string = Buffer.from(decryption_secret)
      .toString("base64url")
      .trim();
    if (!isValidBase64UrlEncoding(decryption_secret_base64url)) {
      throw new Error(
        "'decryption_secret_base64url' getter returned invalid base64url-encoded decryption secret!",
      );
    }
    return decryption_secret_base64url;
  }

  /**
   * @name private_signing_secret
   * @description attempts to load KeyLike RS256 PKCS8 private key from this._private_signing_secret (which should be prepopulated from the constructor, or undefined if this environment does not contain said key)
   * @see JWT_Keys.load_private_signing_key
   * @throws if this._private_signing_secret is not defined
   */
  public get private_signing_secret(): KeyLike {
    if (!this._private_signing_secret_key) {
      console.error(
        `Please set the signing secret key at env var: ${JWT_Keys_Env.PRIVATE_JWT_SIGNING_SECRET}`,
      );
      throw new Error("[JWT_Keys] Missing signing secret key");
    }
    return this._private_signing_secret_key;
  }

  private static throwForMissingPrivateSigningKey(): never {
    throw new Error(
      "Private RSA256 PKCS8 signing key not saved within this JWT_Keys instance!",
    );
  }

  public get private_signing_secret_pkcs8(): string {
    if (
      !this._raw_private_signing_secret_pkcs8 ||
      !this._private_signing_secret_key
    ) {
      JWT_Keys.throwForMissingPrivateSigningKey();
    }
    return this._raw_private_signing_secret_pkcs8;
  }

  public get private_signing_secret_base64url(): string {
    if (
      !this._raw_private_signing_secret_pkcs8 ||
      !this._private_signing_secret_key
    ) {
      JWT_Keys.throwForMissingPrivateSigningKey();
    }

    const pkcs8: string = this.private_signing_secret_pkcs8;
    const base64url_encoded_signing_secret: string = toBase64UrlEncoded(pkcs8);
    const isValid: boolean = isValidBase64UrlEncoding(
      base64url_encoded_signing_secret,
    );
    if (!isValid) {
      throw new TypeError(
        "'private_signing_secret_base64url' getter generated invalid base64url-encoded key!",
      );
    }
    return base64url_encoded_signing_secret;
  }

  /**
   * @name public_signing_verifier
   * @description attempts to load KeyLike RS256 SPKI public key from this._public_signing_verifier (which should be prepopulated from the constructor, or undefined if this environment does not contain said key)
   * @see JWT_Keys.load_public_signing_verifier
   * @throws if this._public_signing_verifier is not defined
   */
  public get public_signing_verifier(): KeyLike {
    if (!this._public_signing_verifier_key) {
      console.error(
        `Please set the signing public verifier key at env var: ${JWT_Keys_Env.PUBLIC_JWT_SIGNING_VERIFIER}`,
      );
      throw new Error("[JWT_Keys] Missing public signing verifier key!");
    }
    return this._public_signing_verifier_key;
  }

  public get public_signing_verifier_spki(): string {
    if (typeof this._raw_public_signing_verifier_spki !== "string") {
      throw new Error(
        "Failed to load public signing verifier SPKI key! Not contained within this JWT_Keys instance!",
      );
    }
    return this._raw_public_signing_verifier_spki;
  }

  public get public_signing_verifier_base64url(): string {
    const spki_format: string = this.public_signing_verifier_spki.trim();
    const base64urlEncodedSigningVerifier: string =
      toBase64UrlEncoded(spki_format);
    const isValid: boolean = isValidBase64UrlEncoding(
      base64urlEncodedSigningVerifier,
    );
    if (!isValid) {
      throw new TypeError(
        "'public_signing_verifier_base64url' getter generated invalid base64url-encoded key!",
      );
    }
    if (this.debug) {
      console.log(
        "[public_signing_verifier_base64url] Converted PEM-encoded SPKI key to base64url: ",
        base64urlEncodedSigningVerifier,
      );
    }
    return base64urlEncodedSigningVerifier;
  }

  private static maybeStripQuotes(
    maybeQuotes?: string | undefined,
  ): string | undefined {
    return maybeStripQuotes(maybeQuotes);
  }

  private static parse_pkcs8_private_signing_key(
    opts?:
      | Initialize_JWT_Keys_Options
      | Initialize_JWT_Keys_Options_Base64UrlEncoded,
  ) {
    let debug: boolean;
    if (typeof opts?.debug === "boolean") {
      debug = opts.debug satisfies boolean;
    } else {
      debug = getDefaultDebugState(JWT_Keys.environment);
    }

    let private_signing_secret_pkcs8: string | undefined;
    if (
      !!opts &&
      "private_signing_secret" in opts &&
      opts.private_signing_secret
    ) {
      if (typeof opts.private_signing_secret !== "string") {
        throw new Error("Expected 'private_signing_secret' to be a string");
      }

      if (debug) {
        console.log(
          "[parse_pkcs8_private_signing_key] Received private signing secret (as what should be PEM-encoded PKCS#8 key) via input 'private_signing_secret': ",
          opts.private_signing_secret satisfies string,
        );
      }

      private_signing_secret_pkcs8 = opts.private_signing_secret;
    } else if (
      !!opts &&
      "private_signing_secret_base64url" in opts &&
      opts.private_signing_secret_base64url
    ) {
      if (typeof opts.private_signing_secret_base64url !== "string") {
        throw new Error(
          "Expected 'private_signing_secret_base64url' to be a string",
        );
      }

      if (debug) {
        console.log(
          "[parse_pkcs8_private_signing_key] ",
          "Received base64url-encoded private signing secret via input 'private_signing_secret_base64url': ",
          opts.private_signing_secret_base64url satisfies string,
        );
      }

      const utf8PrivateKey: string = fromBase64UrlEncoded(
        opts.private_signing_secret_base64url,
      );

      if (debug) {
        console.log(
          "[parse_pkcs8_private_signing_key] ",
          "Converted base64url-encoded private signing secret from input 'private_signing_secret_base64url' to utf-8 (should now be PEM-encoded PKCS#8): ",
          utf8PrivateKey satisfies string,
        );
      }

      private_signing_secret_pkcs8 = utf8PrivateKey;
    } else if (process.env[JWT_Keys_Env.PRIVATE_JWT_SIGNING_SECRET]) {
      const base64_env_key = JWT_Keys.maybeStripQuotes(
        process.env[JWT_Keys_Env.PRIVATE_JWT_SIGNING_SECRET],
      );
      if (typeof base64_env_key !== "string") {
        throw new Error(
          `Environment variable ${JWT_Keys_Env.PRIVATE_JWT_SIGNING_SECRET} is not a string`,
        );
      }
      const utf8PrivateKey = fromBase64UrlEncoded(base64_env_key);

      console.log(
        "[parse_pkcs8_private_signing_key] ",
        `Converted base64url-encoded private signing secret from environment variable '${JWT_Keys_Env.PRIVATE_JWT_SIGNING_SECRET}' to utf-8 (should now be PEM-encoded PKCS#8): `,
        utf8PrivateKey satisfies string,
      );

      private_signing_secret_pkcs8 = utf8PrivateKey;
    } else {
      private_signing_secret_pkcs8 = undefined;
    }

    if (
      !private_signing_secret_pkcs8 ||
      typeof private_signing_secret_pkcs8 !== "string"
    ) {
      throw new Error(
        `Failed to parse PEM-encoded PKCS8 RSA256 key from input options or environment variable '${JWT_Keys_Env.PRIVATE_JWT_SIGNING_SECRET}'!`,
      );
    } else if (
      !PEMFormat.isPemFormat(private_signing_secret_pkcs8, "PRIVATE")
    ) {
      throw new Error(
        "The string found for 'private_signing_secret_pkcs8' does not appear to be in PEM format!",
      );
    }

    if (JWT_Keys.environment === "development") {
      console.log(
        "Successfully imported PEM-encoded PKCS8 private signature signing key!",
      );
    }

    return private_signing_secret_pkcs8;
  } // end of parse_pkcs8_private_signing_key

  private static async init_private_signing_crypto_key(
    pkcs8: string,
  ): Promise<KeyLike> {
    const initializedPkcs8CryptoKey: KeyLike = await importPKCS8(
      pkcs8,
      "RS256",
    );
    return initializedPkcs8CryptoKey;
  }

  private static parse_spki_public_verifier_key(
    opts?:
      | Initialize_JWT_Keys_Options
      | Initialize_JWT_Keys_Options_Base64UrlEncoded,
  ) {
    const debug: boolean = opts?.debug ?? false;

    let public_signing_verifier_spki: string | undefined = undefined;
    try {
      if (
        !!opts &&
        "public_signing_verifier" in opts &&
        opts.public_signing_verifier
      ) {
        if (typeof opts.public_signing_verifier !== "string") {
          throw new Error("Expected 'public_signing_verifier' to be a string");
        }

        if (debug) {
          console.log(
            "[parse_spki_public_verifier_key] Received public verifier key (as what should be PEM-encoded SPKI key) via input 'public_signing_verifier': ",
            opts.public_signing_verifier satisfies string,
          );
        }

        public_signing_verifier_spki = opts.public_signing_verifier;
      } else if (
        !!opts &&
        "public_signing_verifier_base64url" in opts &&
        opts.public_signing_verifier_base64url
      ) {
        if (typeof opts.public_signing_verifier_base64url !== "string") {
          throw new Error(
            "Expected 'public_signing_verifier_base64url' to be a string",
          );
        }

        if (debug) {
          console.log(
            "[parse_spki_public_verifier_key] Received public verifier key in base64url-format via input 'public_signing_verifier_base64url': ",
            opts.public_signing_verifier_base64url satisfies string,
          );
        }

        const utf8PublicKey: string = fromBase64UrlEncoded(
          opts.public_signing_verifier_base64url,
        );

        if (debug) {
          console.log(
            "[parse_spki_public_verifier_key] Converted public verifier key in base64url-format via input 'public_signing_verifier_base64url' to PEM-encoded SPKI key: ",
            utf8PublicKey satisfies string,
          );
        }

        public_signing_verifier_spki = utf8PublicKey;
      } else if (process.env[JWT_Keys_Env.PUBLIC_JWT_SIGNING_VERIFIER]) {
        const base64_env_key = JWT_Keys.maybeStripQuotes(
          process.env[JWT_Keys_Env.PUBLIC_JWT_SIGNING_VERIFIER],
        );
        if (typeof base64_env_key !== "string") {
          throw new Error(
            `Environment variable '${JWT_Keys_Env.PUBLIC_JWT_SIGNING_VERIFIER}' is not a string`,
          );
        }

        if (debug) {
          console.log(
            `[parse_spki_public_verifier_key] Received public verifier key in base64url-format via environment variable '${JWT_Keys_Env.PUBLIC_JWT_SIGNING_VERIFIER}': `,
            base64_env_key satisfies string,
          );
        }

        const utf8PublicKey: string = fromBase64UrlEncoded(base64_env_key);

        if (debug) {
          console.log(
            `[parse_spki_public_verifier_key] Converted public verifier key in base64url-format via environment variable '${JWT_Keys_Env.PUBLIC_JWT_SIGNING_VERIFIER}' to PEM-encoded SPKI key: `,
            utf8PublicKey satisfies string,
          );
        }

        public_signing_verifier_spki = utf8PublicKey;

        if (debug) {
          console.log(
            "[parse_spki_public_verifier_key] Successfully imported public signature verifier key from environment variables!",
          );
        }
      } else {
        public_signing_verifier_spki = undefined;
      }
    } catch (e: unknown) {
      console.error(
        "Failed to import public key for JWT signature verification: ",
        e,
      );
      public_signing_verifier_spki = undefined;
    }

    if (typeof public_signing_verifier_spki !== "string") {
      throw new Error(
        `Failed to load PEM-encoded SPKI public signature verifier key from input options or environment variable '${JWT_Keys_Env.PUBLIC_JWT_SIGNING_VERIFIER}'!`,
      );
    } else if (!PEMFormat.isPemFormat(public_signing_verifier_spki, "PUBLIC")) {
      throw new Error(
        "The string found for 'public_signing_verifier_spki' does not appear to be in PEM-encoded SPKI format!",
      );
    }
    return public_signing_verifier_spki;
  }

  private static async init_spki_public_verifier_key(
    spki: string,
  ): Promise<KeyLike> {
    return await importSPKI(spki, "RS256");
  }

  /**
   *
   * @param opts Object containing keys to initialize JWT_Keys instance from. If not defined, environment variables will be searched for keys.
   * @overload can pass either 'private_signing_secret' (pkcs8 format) or 'private_signing_secret_base64url'
   * @overload can pass either 'public_signing_verifier' (spki format) or 'public_signing_verifier_base64url'
   * @returns An instance of JWT_Keys
   */
  public static async init(
    opts?:
      | Initialize_JWT_Keys_Options
      | Initialize_JWT_Keys_Options_Base64UrlEncoded, // same as Initialize_JWT_Keys_Options but with base64url-encoded private/public RSA256 signing keys
  ): Promise<JWT_Keys> {
    let debug: boolean;
    if (typeof opts?.debug === "boolean") {
      debug = opts.debug satisfies boolean;
    } else {
      debug = getDefaultDebugState(JWT_Keys.environment);
    }

    if (debug) {
      console.log(
        "[JWT_Keys] init() - Attempting to initialize key set from environment variables and/or input options...",
      );
    }

    const encryption_secret: string | undefined = opts?.encryption_secret;
    const decryption_secret: string | undefined = opts?.decryption_secret;

    let public_signing_verifier_spki: string;
    let public_signing_verifier_key: KeyLike;
    try {
      public_signing_verifier_spki =
        JWT_Keys.parse_spki_public_verifier_key(opts);
      public_signing_verifier_key =
        await JWT_Keys.init_spki_public_verifier_key(
          public_signing_verifier_spki,
        );
    } catch (e: unknown) {
      console.error("Failed to load public signing verifier: ", e);
      throw new Error(
        `Failed to load public signing verifier from input options or env var: '${JWT_Keys_Env.PUBLIC_JWT_SIGNING_VERIFIER}'`,
      );
    }

    let private_signing_secret_pkcs8: string | undefined = undefined;
    let private_signing_secret_key: KeyLike | undefined = undefined;
    try {
      private_signing_secret_pkcs8 =
        JWT_Keys.parse_pkcs8_private_signing_key(opts);
      private_signing_secret_key =
        await JWT_Keys.init_private_signing_crypto_key(
          private_signing_secret_pkcs8,
        );
    } catch (e: unknown) {
      if (typeof private_signing_secret_pkcs8 === "string") {
        console.error(
          "Error initializing private signing crypto key from PEM-encoded PKCS8 formatted key:",
          e,
        );
      }
      /** non-op, not all environments have private signing key set... pretty much just the auth server. it will throw later if not set! */
      private_signing_secret_pkcs8 = undefined;
      private_signing_secret_key = undefined;
    }

    const output = new JWT_Keys({
      encryption_secret,
      decryption_secret,
      private_signing_secret_key,
      private_signing_secret_pkcs8,
      public_signing_verifier_key,
      public_signing_verifier_spki,
      debug,
    });
    return output;
  } // end of init()

  /**
   * @name JWT_Keys.generateJwtContentEncryptionKey()
   * @param debug Enable additional debug logging
   * @returns 256-bit base64url-encoded content encryption key (string)
   */
  public static generateJwtContentEncryptionKey(
    debug: boolean = false,
  ): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const cek = Buffer.from(randomBytes).toString("base64url");
    if (debug) {
      console.log(
        "[JWT_Keys] Generated C.E.K encryption/decryption key: ",
        cek,
      );
    }
    return cek;
  }

  /**
   *
   * @param debug Enable additional debug logging
   * @returns A PKCS8 and SPKI RS256 formatted key pair in s
   */
  public static async generateJwtSigningKeyPair(
    debug: boolean = false,
  ): Promise<[private_key: string, public_key: string]> {
    const key_pair_factory = new SigningKeyPairFactory({ debug });
    const [privateKey, publicKey] = await key_pair_factory.generate("pem");

    if (debug) {
      console.log("[JWT_Keys] Generated public/private signing key pair: ", [
        privateKey,
        publicKey,
      ]);
    }

    return [privateKey, publicKey] as const satisfies [
      private_key: string,
      public_key: string,
    ];
  }

  /**
   * @name JWT_Keys.createKeys()
   * @param opts Optionally specify a 'debug' boolean flag.
   * @see JWT_Keys.generateJwtContentEncryptionKey()
   * @see JWT_Keys.generateJwtSigningKeyPair()
   * @returns An instance of JWT_Keys populated with the generated keys
   */
  public static async createKeys(opts?: {
    debug?: boolean;
  }): Promise<JWT_Keys> {
    let debug: boolean;
    if (typeof opts?.debug === "boolean") {
      debug = opts.debug satisfies boolean;
    } else {
      debug = getDefaultDebugState(JWT_Keys.environment);
    }

    const encryptDecryptKey: string =
      JWT_Keys.generateJwtContentEncryptionKey(debug);

    const [privateKey, publicKey] =
      await JWT_Keys.generateJwtSigningKeyPair(debug);

    const generatedKeys: JWT_Keys = await JWT_Keys.init({
      encryption_secret: encryptDecryptKey,
      decryption_secret: encryptDecryptKey,
      private_signing_secret: privateKey,
      public_signing_verifier: publicKey,
      debug,
    });

    if (debug) {
      console.log("[JWT_Keys] createKeys() -> ", generatedKeys);
    }

    return generatedKeys;
  }
}
