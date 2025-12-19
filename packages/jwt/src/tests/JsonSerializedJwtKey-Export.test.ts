import {
  generateNewJwtKeySet,
  type JsonSerializedJwtKey,
  jsonSerializedJwtKeySchema,
} from "@/jwt/jwt_keys";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import { describe, expect, test } from "bun:test";

function isValidJsonSerializedJwtKey(
  val: unknown,
): val is JsonSerializedJwtKey {
  const parsed = jsonSerializedJwtKeySchema.safeParse(val);
  if (!parsed.success) {
    console.error(parsed.data);
  }
  return parsed.success;
}

describe("JsonSerializedJwtKey-Export", () => {
  test("can export JsonSerializedJwtKey from a JWT_Keys instance; all keys are parsed as valid by schema for JsonSerializedJwtKey", async () => {
    const jwt_keys = await generateNewJwtKeySet({
      audience_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    });

    const verification = jwt_keys.verification_key_json;
    const signing = jwt_keys.signing_key_json;
    const encryption = jwt_keys.encryption_key_json;
    const decryption = jwt_keys.decryption_key_json;

    if (!verification || !signing || !encryption || !decryption) {
      throw new Error("JWT keys are missing from generated keyset");
    }

    expect(isValidJsonSerializedJwtKey(verification)).toBe(true);
    expect(isValidJsonSerializedJwtKey(signing)).toBe(true);
    expect(isValidJsonSerializedJwtKey(encryption)).toBe(true);
    expect(isValidJsonSerializedJwtKey(decryption)).toBe(true);
  });

  test("decryption key is exported as a private key", async () => {
    const jwt_keys = await generateNewJwtKeySet({
      audience_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    });
    const decryption: JsonSerializedJwtKey = jwt_keys.decryption_key_json;
    expect(decryption.privacy_level).toBe("private");
  });

  test("encryption key is exported as a public key", async () => {
    const jwt_keys = await generateNewJwtKeySet({
      audience_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    });
    const encryption: JsonSerializedJwtKey | null =
      jwt_keys.encryption_key_json;
    if (!encryption) {
      throw new Error("Encryption key is missing from generated keyset");
    }
    expect(encryption.privacy_level).toBe("public");
  });

  test("signing key is exported as a private key", async () => {
    const jwt_keys = await generateNewJwtKeySet({
      audience_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    });
    const signing: JsonSerializedJwtKey | null = jwt_keys.signing_key_json;
    if (!signing) {
      throw new Error("Signing key is missing from generated keyset");
    }
    expect(signing.privacy_level).toBe("private");
  });

  test("verification key is exported as a public key", async () => {
    const jwt_keys = await generateNewJwtKeySet({
      audience_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    });
    const verification: JsonSerializedJwtKey | null =
      jwt_keys.verification_key_json;
    if (!verification) {
      throw new Error("Verification key is missing from generated keyset");
    }
    expect(verification.privacy_level).toBe("public");
  });
});
