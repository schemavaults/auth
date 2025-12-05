import { describe, expect, test } from "bun:test";
import generateNewJwtKeySet from "./generate_new_jwt_keyset";

const DEBUG: boolean = false;

describe("Generate new JWT keyset", () => {
  test("should generate a new JWT keyset", async () => {
    const keyset = await generateNewJwtKeySet();
    expect(keyset).toBeDefined();
    const keys = keyset.exportKeys();
    expect(keys).toBeDefined();
    if (DEBUG) {
      console.log(keys);
    }
  });
});
