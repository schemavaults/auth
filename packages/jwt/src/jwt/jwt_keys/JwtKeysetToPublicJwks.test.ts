import { describe, it, expect } from "bun:test";
import generateNewJwtKeySet from "./generate_new_jwt_keyset";
import to_public_jwks from "./to_public_jwks";
import isValidUuid from "@/utils/isValidUuid";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

const environment: SchemaVaultsAppEnvironment = "test";

describe("JWT Key Set to Public JWKS", () => {
  it("only contains decryption/verification keys", async () => {
    const keyset = await generateNewJwtKeySet({
      audience_id: crypto.randomUUID(),
      environment,
    });
    const keyset_id: string = keyset.keyset_id;
    expect(isValidUuid(keyset_id)).toBeTrue();

    const jwks = await to_public_jwks(keyset);
    expect(jwks).toBeDefined();
    expect(jwks.keys).toBeArrayOfSize(2);
    expect(
      jwks.keys.every((jwk) => "kid" in jwk && typeof jwk.kid === "string"),
      "Expected all keys to have a 'kid' property of type string",
    ).toBeTrue();
  });

  it("can include multiple keysets in JWKS output", async () => {
    const api_server_id: string = crypto.randomUUID();
    const keyset1 = await generateNewJwtKeySet({
      audience_id: api_server_id,
      environment,
    });
    const keyset2 = await generateNewJwtKeySet({
      audience_id: api_server_id,
      environment,
    });
    const keyset3 = await generateNewJwtKeySet({
      audience_id: api_server_id,
      environment,
    });
    expect(keyset1.keyset_id).toBeString();
    expect(keyset2.keyset_id).toBeString();
    expect(keyset3.keyset_id).toBeString();
    expect(keyset1.keyset_id).not.toBe(keyset2.keyset_id);
    expect(keyset2.keyset_id).not.toBe(keyset3.keyset_id);

    const jwks = await to_public_jwks([keyset1, keyset2, keyset3]);
    expect(jwks).toBeDefined();
    expect(jwks.keys).toBeArrayOfSize(6);
    expect(
      jwks.keys.every((jwk) => "kid" in jwk && typeof jwk.kid === "string"),
      "Expected all keys to have a 'kid' property of type string",
    ).toBeTrue();
  });

  it("keys include an 'alg' property", async () => {
    const api_server_id: string = crypto.randomUUID();
    const keyset1 = await generateNewJwtKeySet({
      audience_id: api_server_id,
      environment,
    });
    const keyset2 = await generateNewJwtKeySet({
      audience_id: api_server_id,
      environment,
    });
    const keyset3 = await generateNewJwtKeySet({
      audience_id: api_server_id,
      environment,
    });
    const jwks = await to_public_jwks([keyset1, keyset2, keyset3]);
    expect(
      jwks.keys.every((jwk) => "alg" in jwk && typeof jwk.alg === "string"),
    ).toBeTrue();
  });
});
