import { generateNewJwtKeySet, JWT_Keys } from "@/jwt";
import { describe, test, expect } from "bun:test";

function expectString(val: string | null): val is string {
  expect(val).toBeString()
  if (typeof val === "string") {
    return true;
  }
  return false;
}

describe("JWT_Keys base64url export & import", () => {
  test("can export keys in base64url, and reimport", async () => {
    let errorThrown: boolean = false;
    try {
      const keys = (await generateNewJwtKeySet()).exportKeys();

      const decryption_secret_base64url: string = keys.decryption_base64url;
      const encryption_secret_base64url: string | null = keys.encryption_base64url;
      const signing_base64url: string | null =
        keys.signing_base64url;
      const verifier_base64url: string =
        keys.verification_base64url;

      if (!expectString(encryption_secret_base64url)) {
        throw new TypeError("encryption_secret_base64url is not a string");
      }
      if (!expectString(signing_base64url)) {
        throw new TypeError("signing_base64url is not a string");
      }

      const reinited = new JWT_Keys({
        signing: {
          value: signing_base64url,
          name: "signing",
          format: "base64url",
          privacyLevel: "private",
        },
        verification: {
          value: verifier_base64url,
          name: "verification",
          format: "base64url",
          privacyLevel: "public",
        },
        encryption: {
          value: encryption_secret_base64url,
          name: "encryption",
          format: "base64url",
          privacyLevel: "public",
        },
        decryption: {
          value: decryption_secret_base64url,
          name: "decryption",
          format: "base64url",
          privacyLevel: "private",
        },
      });
      const reinited_keys = reinited.exportKeys();

      expect(reinited_keys.decryption_base64url).toBe(
        decryption_secret_base64url,
      );
      expect(reinited_keys.encryption_base64url).toBe(
        encryption_secret_base64url,
      );
      expect(reinited_keys.signing_base64url).toBe(
        signing_base64url,
      );
      expect(reinited_keys.verification_base64url).toBe(
        verifier_base64url,
      );
      expect(reinited_keys.verification).toBe(
        keys.verification,
      );
      expect(reinited_keys.signing).toBe(
        keys.signing,
      );
    } catch (e: unknown) {
      console.error(e)
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });
});
