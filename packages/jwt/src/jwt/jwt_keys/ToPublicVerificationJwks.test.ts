import { describe, it, expect } from "bun:test";
import generateNewJwtKeySet from "./generate_new_jwt_keyset";
import to_public_verification_jwks from "./to_public_verification_jwks";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

const environment: SchemaVaultsAppEnvironment = "test";

const PRIVATE_JWK_FIELDS = ["d", "p", "q", "dp", "dq", "qi", "k"] as const;

describe("to_public_verification_jwks", () => {
  it("contains ONLY public RS256 verification keys (no private material)", async () => {
    const keyset = await generateNewJwtKeySet({
      audience_id: "oidc-userinfo",
      environment,
    });

    const jwks = await to_public_verification_jwks(keyset);
    expect(jwks.keys).toBeArrayOfSize(1);

    const jwk = jwks.keys[0]!;
    expect(jwk.kid).toBe(`${keyset.keyset_id}-verification`);
    expect(jwk.alg).toBe("RS256");
    expect(jwk.use).toBe("sig");
    expect(jwk.kty).toBe("RSA");
    expect(jwk.n).toBeString();
    expect(jwk.e).toBeString();

    for (const private_field of PRIVATE_JWK_FIELDS) {
      expect(
        jwk,
        `JWK must not contain private field '${private_field}'`,
      ).not.toHaveProperty(private_field);
    }
  });

  it("never emits decryption kids and covers every active keyset", async () => {
    const keyset1 = await generateNewJwtKeySet({
      audience_id: "oidc-userinfo",
      environment,
    });
    const keyset2 = await generateNewJwtKeySet({
      audience_id: "oidc-userinfo",
      environment,
    });

    const jwks = await to_public_verification_jwks([keyset1, keyset2]);
    expect(jwks.keys).toBeArrayOfSize(2);
    const kids = jwks.keys.map((k) => k.kid);
    expect(kids).toContain(`${keyset1.keyset_id}-verification`);
    expect(kids).toContain(`${keyset2.keyset_id}-verification`);
    expect(kids.every((kid) => kid!.endsWith("-verification"))).toBeTrue();
    expect(kids.some((kid) => kid!.includes("decryption"))).toBeFalse();
  });
});
