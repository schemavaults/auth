import { generateNewJwtKeySet, JWT_Keys } from "@/jwt";
import { describe, test, expect } from "bun:test";

describe("JWT_Keys instance initialization w/o auth-server-only keys", () => {
  test("can reinitialize a JWT_Keys instance w/o encryption or signing key", async () => {
    let errorThrown: boolean = false;
    try {
      const keys: JWT_Keys = await generateNewJwtKeySet();
      const keyset_id: string = keys.keyset_id;
      const decryption: string = keys.raw_keys.decryption;
      const verification: string = keys.raw_keys.verification;

      const reinited = new JWT_Keys({
        keyset_id,
        keyset_expiry: keys.keyset_expiry,
        decryption: { value: decryption, privacy_level: 'private', format: "pem", key_type: "decryption", keyset_id },
        verification: { value: verification, privacy_level: 'public', format: "pem", key_type: "verification", keyset_id },
        is_auth_server: false
      });

      expect(decryption).toBe(reinited.raw_keys.decryption);
      expect(verification).toBe(reinited.raw_keys.verification);
      expect(reinited.raw_keys.encryption).toBeFalsy();
      expect(reinited.raw_keys.signing).toBeFalsy();
    } catch (e: unknown) {
      void e;
      errorThrown = true;
    }
    expect(errorThrown, "An error should not be thrown initializing JWT_Keys without encryption or signing keys").toBeFalse();
  });
});
