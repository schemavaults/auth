import type { JsonSerializedJwtKey } from "./JsonSerializedJwtKey";
import encryptDecryptAlg from "../encrypt_decrypt_alg";
import signVerifyAlg from "../sign_verify_alg";

export default function getAlgorithmForKey(key: JsonSerializedJwtKey): string {
  if (key.key_type === "encryption" || key.key_type === "decryption") {
    return encryptDecryptAlg;
  } else if (key.key_type === "signing" || key.key_type === "verification") {
    return signVerifyAlg;
  } else {
    throw new Error(`Unsupported key type: ${key.key_type}`);
  }
}
