import { test, describe, expect } from "bun:test";
import { JWT_Keys } from "./jwt_keys";
import printJwtKeysAsEnvVars from "./print-jwt-keys-as-env-vars";

describe("Print Key Environment Variables", () => {
  test("can generate keys & print them their environment variable representations", async () => {
    let errorThrown: boolean = false;
    try {
      const keys = await JWT_Keys.createKeys();
      printJwtKeysAsEnvVars(keys, console.log);
    } catch (e: unknown) {
      errorThrown = true;
    }
    expect(errorThrown).toBeFalse();
  });
});
