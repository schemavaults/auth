import { apiServerIdSchema } from "@schemavaults/app-definitions";
import ContentEncryptionKeyPairFactory from "./ContentEncryptionKeyPairFactory";
import JWT_Keys from "./jwt_keys";
import SigningKeyPairFactory from "./SigningKeyPairFactory";
import isValidUuid from "@/utils/isValidUuid";

/**
 * @name generateJwtSigningKeyPair
 * @param debug Enable additional debug logging
 * @returns A PKCS8 and SPKI formatted RS256 key pair
 */
export async function generateJwtSigningKeyPair(
  debug: boolean = false,
): Promise<[private_key: string, public_key: string]> {
  const signing_key_pair_factory = new SigningKeyPairFactory({ debug });
  const [privateKey, publicKey] =
    await signing_key_pair_factory.generate("pem");

  return [privateKey, publicKey] as const satisfies [
    private_key: string,
    public_key: string,
  ];
}

/**
 * @name generateJwtContentEncryptionKeyPair()
 * @param debug Enable additional debug logging
 * @returns 256-bit base64url-encoded content encryption key (string)
 */
export async function generateJwtContentEncryptionKeyPair(
  debug: boolean = false,
): Promise<[private_key: string, public_key: string]> {
  const cek_key_pair_factory = new ContentEncryptionKeyPairFactory({ debug });
  const [privateKey, publicKey] = await cek_key_pair_factory.generate("pem");

  if (debug) {
    console.log("[JWT_Keys] Generated encryption/decryption key pair: ", [
      privateKey,
      publicKey,
    ]);
  }

  return [privateKey, publicKey] as const satisfies [
    private_key: string,
    public_key: string,
  ];
}

export interface IGenerateNewJwtKeySetOpts {
  audience_id: string;
  keyset_id?: string;
  keyset_expiry?: number;
  debug?: boolean;
}

const DEFAULT_KEYSET_VALID_DURATION: number = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function generateNewJwtKeySet(
  opts: IGenerateNewJwtKeySetOpts,
): Promise<JWT_Keys> {
  if (!opts || typeof opts !== "object") {
    throw new TypeError(
      "Expected first argument to be an object of type IGenerateNewJwtKeySetOpts",
    );
  }

  const debug: boolean = opts?.debug || false;

  const audience_id: string = opts.audience_id;
  if (typeof audience_id !== "string") {
    throw new TypeError(
      `Invalid audience ID: '${audience_id}'. Should be a string.`,
    );
  } else if (!apiServerIdSchema.safeParse(audience_id).success) {
    throw new TypeError(
      `Invalid audience ID: '${audience_id}'. Should be a valid API server ID.`,
    );
  }

  if (typeof opts?.keyset_id === "string") {
    if (!isValidUuid(opts.keyset_id)) {
      throw new TypeError(
        `Invalid keyset ID: '${opts.keyset_id}'. Should be a valid UUID, if provided.`,
      );
    }
  } else {
    opts.keyset_id = undefined;
  }

  const [
    [privateEncryptDecryptKey, publicEncryptDecryptKey],
    [privateSigningKey, publicSigningVerifierKey],
  ] = await Promise.all([
    generateJwtContentEncryptionKeyPair(debug),
    generateJwtSigningKeyPair(debug),
  ]);

  const keyset_id: string =
    typeof opts?.keyset_id === "string" ? opts.keyset_id : crypto.randomUUID();
  const keyset_expiry: number =
    typeof opts?.keyset_expiry === "number"
      ? opts.keyset_expiry
      : Date.now() + DEFAULT_KEYSET_VALID_DURATION;
  if (keyset_expiry < Date.now()) {
    throw new Error(
      `Invalid keyset expiry: '${keyset_expiry}'. Should be a future timestamp.`,
    );
  }

  const generatedKeys: JWT_Keys = new JWT_Keys({
    audience_id,
    keyset_id,
    keyset_expiry,
    encryption: {
      // encryption happens with public key
      format: "pem",
      privacy_level: "public",
      value: publicEncryptDecryptKey,
      key_type: "encryption",
      keyset_id,
      audience_id,
    },
    decryption: {
      // decryption happens with private key (counter-intuitively)
      value: privateEncryptDecryptKey,
      privacy_level: "private",
      format: "pem",
      key_type: "decryption",
      keyset_id,
      audience_id,
    },
    signing: {
      value: privateSigningKey,
      privacy_level: "private",
      format: "pem",
      key_type: "signing",
      keyset_id,
      audience_id,
    },
    verification: {
      value: publicSigningVerifierKey,
      privacy_level: "public",
      format: "pem",
      key_type: "verification",
      keyset_id,
      audience_id,
    },
    is_auth_server: true,
  });

  if (debug) {
    console.log("generateNewJwtKeySet() -> ", generatedKeys);
  }

  return generatedKeys;
}

export default generateNewJwtKeySet;
