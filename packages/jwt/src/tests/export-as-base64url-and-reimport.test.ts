import { generateNewJwtKeySet, JWT_Keys } from "@/jwt";
import { describe, test, expect } from "bun:test";

function expectString(val: string | null): val is string {
  expect(val).toBeString();
  if (typeof val === "string") {
    return true;
  }
  return false;
}

describe("JWT_Keys base64url export & import", () => {
  test("can export keys in base64url, and reimport", async () => {
    const api_server_id: string = crypto.randomUUID();
    const audience_id: string = api_server_id;

    let errorThrown: boolean = false;
    try {
      const keyset = await generateNewJwtKeySet({
        audience_id,
      });
      const keyset_id: string = keyset.keyset_id;
      const keys = keyset.exportKeys();

      const decryption_secret_base64url: string = keys.decryption_base64url;
      const encryption_secret_base64url: string | null =
        keys.encryption_base64url;
      const signing_base64url: string | null = keys.signing_base64url;
      const verifier_base64url: string = keys.verification_base64url;

      if (!expectString(encryption_secret_base64url)) {
        throw new TypeError("encryption_secret_base64url is not a string");
      }
      if (!expectString(signing_base64url)) {
        throw new TypeError("signing_base64url is not a string");
      }

      const reinited = new JWT_Keys({
        audience_id,
        keyset_id,
        keyset_expiry: keyset.keyset_expiry,
        signing: {
          value: signing_base64url,
          key_type: "signing",
          format: "base64url",
          privacy_level: "private",
          keyset_id,
          audience_id,
        },
        verification: {
          value: verifier_base64url,
          key_type: "verification",
          format: "base64url",
          privacy_level: "public",
          keyset_id,
          audience_id,
        },
        encryption: {
          value: encryption_secret_base64url,
          key_type: "encryption",
          format: "base64url",
          privacy_level: "public",
          keyset_id,
          audience_id,
        },
        decryption: {
          value: decryption_secret_base64url,
          key_type: "decryption",
          format: "base64url",
          privacy_level: "private",
          keyset_id,
          audience_id,
        },
      });
      const reinited_keys = reinited.exportKeys();

      expect(reinited_keys.decryption_base64url).toBe(
        decryption_secret_base64url,
      );
      expect(reinited_keys.encryption_base64url).toBe(
        encryption_secret_base64url,
      );
      expect(reinited_keys.signing_base64url).toBe(signing_base64url);
      expect(reinited_keys.verification_base64url).toBe(verifier_base64url);
      expect(reinited_keys.verification).toBe(keys.verification);
      expect(reinited_keys.signing).toBe(keys.signing);
    } catch (e: unknown) {
      console.error(e);
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });
});
