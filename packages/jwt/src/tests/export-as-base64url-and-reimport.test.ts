import { JWT_Keys } from "@/jwt";
import { describe, test, expect } from "bun:test";

describe("JWT_Keys base64url export & import", () => {
  test("can export keys in base64url, and reimport", async () => {
    let errorThrown: boolean = false;
    try {
      const keys = await JWT_Keys.createKeys();

      const decryption_secret_base64url = keys.decryption_secret_base64url;
      const encryption_secret_base64url = keys.encryption_secret_base64url;
      const private_signing_secret_base64url =
        keys.private_signing_secret_base64url;
      const public_signing_verifier_base64url =
        keys.public_signing_verifier_base64url;

      const reinited = await JWT_Keys.init({
        private_signing_secret_base64url,
        public_signing_verifier_base64url,
        decryption_secret: decryption_secret_base64url,
        encryption_secret: encryption_secret_base64url,
      });

      expect(reinited.decryption_secret_base64url).toBe(
        decryption_secret_base64url,
      );
      expect(reinited.encryption_secret_base64url).toBe(
        encryption_secret_base64url,
      );
      expect(reinited.private_signing_secret_base64url).toBe(
        private_signing_secret_base64url,
      );
      expect(reinited.public_signing_verifier_base64url).toBe(
        public_signing_verifier_base64url,
      );
      expect(reinited.public_signing_verifier_spki).toBe(
        keys.public_signing_verifier_spki,
      );
      expect(reinited.private_signing_secret_pkcs8).toBe(
        keys.private_signing_secret_pkcs8,
      );
    } catch (e: unknown) {
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });
});
