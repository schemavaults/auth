import { describe, it, expect } from "bun:test"
import generateNewJwtKeySet from "./generate_new_jwt_keyset"
import to_public_jwks from "./to_public_jwks";
import isValidUuid from "@/utils/isValidUuid";

describe("JWT Key Set to Public JWKS", () => {
  it("only contains decryption/verification keys", async () => {
    const keyset = await generateNewJwtKeySet();
    const keyset_id: string = keyset.keyset_id;
    expect(isValidUuid(keyset_id)).toBeTrue()

    const jwks = await to_public_jwks(keyset);
    expect(jwks).toBeDefined();
    expect(jwks.keys).toBeArrayOfSize(2);
  })

  it("can include multiple keysets in JWKS output", async () => {
    const keyset1 = await generateNewJwtKeySet();
    const keyset2 = await generateNewJwtKeySet();
    const keyset3 = await generateNewJwtKeySet();
    expect(keyset1.keyset_id).toBeString();
    expect(keyset2.keyset_id).toBeString();
    expect(keyset3.keyset_id).toBeString();
    expect(keyset1.keyset_id).not.toBe(keyset2.keyset_id)
    expect(keyset2.keyset_id).not.toBe(keyset3.keyset_id)

    const jwks = await to_public_jwks([keyset1, keyset2, keyset3]);
    expect(jwks).toBeDefined();
    expect(jwks.keys).toBeArrayOfSize(6);
  })
})
