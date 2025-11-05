import { JWT_Keys } from "@/jwt";
import { describe, test, expect } from "bun:test";

describe("JWT_Keys instance initialization w/o auth-server-only keys", () => {
  test("can reinitialize a JWT_Keys instance w/o encryption or signing key", async () => {
    let errorThrown: boolean = false;
    try {
      const keys = await JWT_Keys.createKeys();

      const reinited = await JWT_Keys.init({
        // private_signing_secret: keys.private_signing_secret_pkcs8,
        public_signing_verifier: keys.public_signing_verifier_spki,
        decryption_secret: keys.decryption_secret_base64url,
      });

      const decrypt_secret = reinited.decryption_secret_base64url;
      void decrypt_secret;
      const verifier_secret = reinited.public_signing_verifier_spki;
      void verifier_secret;
    } catch (e: unknown) {
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });
});
