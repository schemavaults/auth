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
});
