import ContentEncryptionKeyPairFactory from "./ContentEncryptionKeyPairFactory";
import { JWT_Keys } from "./jwt_keys";
import SigningKeyPairFactory from "./SigningKeyPairFactory";

/**
 * @name generateJwtSigningKeyPair
 * @param debug Enable additional debug logging
 * @returns A PKCS8 and SPKI formatted RS256 key pair
 */
export async function generateJwtSigningKeyPair(
  debug: boolean = false,
): Promise<[private_key: string, public_key: string]> {
  const signing_key_pair_factory = new SigningKeyPairFactory({ debug });
  const [privateKey, publicKey] = await signing_key_pair_factory.generate("pem");

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
  const [privateKey, publicKey] = await cek_key_pair_factory.generate("pem")

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

export async function generateNewJwtKeySet(debug: boolean = false): Promise<JWT_Keys> {
  const [[privateEncryptDecryptKey, publicEncryptDecryptKey], [privateSigningKey, publicSigningVerifierKey]] =
    await Promise.all([
      generateJwtContentEncryptionKeyPair(debug),
      generateJwtSigningKeyPair(debug)
    ])

  const generatedKeys: JWT_Keys = new JWT_Keys({
    encryption: { // encryption happens with public key
      format: "pem",
      privacyLevel: "public",
      value: publicEncryptDecryptKey,
      name: 'encryption'
    },
    decryption: { // decryption happens with private key (counter-intuitively)
      value: privateEncryptDecryptKey,
      privacyLevel: "private",
      format: "pem",
      name: 'decryption'
    },
    signing: {
      value: privateSigningKey,
      privacyLevel: "private",
      format: "pem",
      name: 'signing'
    },
    verification: {
      value: publicSigningVerifierKey,
      privacyLevel: "public",
      format: "pem",
      name: 'verification'
    },
    is_auth_server: true,
  })

  if (debug) {
    console.log("generateNewJwtKeySet() -> ", generatedKeys);
  }

  return generatedKeys;
}

export default generateNewJwtKeySet;
