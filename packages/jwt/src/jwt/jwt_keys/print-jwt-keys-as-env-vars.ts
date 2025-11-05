import { JWT_Keys } from "./jwt_keys";

export function printJwtKeysAsEnvVars(
  keys: JWT_Keys,
  log: (...messages: string[]) => void = console.log,
): void {
  let encryption_secret: string | undefined = undefined;
  let decryption_secret: string | undefined = undefined;
  let private_rsa_key_base64url: string | undefined = undefined;
  let public_rsa_key_base64url: string | undefined = undefined;

  try {
    encryption_secret = keys.encryption_secret_base64url;
  } catch (e: unknown) {
    console.error("Failed to load encryption secret: ", e);
  }
  try {
    decryption_secret = keys.decryption_secret_base64url;
  } catch (e: unknown) {
    console.error("Failed to load decryption secret: ", e);
  }
  try {
    private_rsa_key_base64url = keys.private_signing_secret_base64url;
  } catch (e: unknown) {
    console.error("Failed to load private RSA signing key: ", e);
  }
  try {
    public_rsa_key_base64url = keys.public_signing_verifier_base64url;
  } catch (e: unknown) {
    console.error("Failed to load public RSA signing key: ", e);
  }

  if (typeof encryption_secret === "string") {
    log(`PRIVATE_JWT_ENCRYPTION_SECRET="${encryption_secret}"`);
  }
  if (typeof decryption_secret === "string") {
    log(`PRIVATE_JWT_DECRYPTION_SECRET="${decryption_secret}"`);
  }
  if (typeof private_rsa_key_base64url === "string") {
    log(`PRIVATE_JWT_SIGNING_SECRET="${private_rsa_key_base64url}"`);
  }
  if (typeof public_rsa_key_base64url === "string") {
    log(`PUBLIC_JWT_SIGNING_VERIFIER="${public_rsa_key_base64url}"`);
  }
}

export default printJwtKeysAsEnvVars;
