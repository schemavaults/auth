import { decodeJWT, generateNewJwtKeySet, type JWT_Keys } from "@/jwt";
import { describe, test, expect } from "bun:test";
import { MockUser } from "@/tests/MockUser";
import { generateJWT, type GenerateJWTOptions } from "@/jwt/generate";
import { createAudienceSchema } from "@schemavaults/auth-common";
import isValidUuid from "@/utils/isValidUuid";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import getAuthServerUri from "@schemavaults/app-definitions/get-auth-server-url";
import { z } from "zod";

const env: SchemaVaultsAppEnvironment = "test";
const environment = env;
const auth_server_url: string = getAuthServerUri(env);
const audienceSchema = createAudienceSchema(z, env);

async function isGenerateAndDecodeTokenForStorageRegionSuccess(
  region_id: string,
): Promise<boolean> {
  const user = new MockUser();
  const now = Date.now();
  expect(isValidUuid(region_id)).toBe(true);

  const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
    audience_id: region_id,
    environment,
  });

  const generateOptions: GenerateJWTOptions<"access"> = {
    type: "access",
    user,
    audience: region_id,
    iat: now,
    client_app_id: "schemavaults-cli",
    jwt_keys,
    auth_server_url,
    env,
  };

  const jwt = await generateJWT(generateOptions);
  const decoded = await decodeJWT({
    jwt: jwt.token,
    type: "access",
    jwt_keys,
    audience: region_id,
    env,
  });

  expect(decoded.uid).toBe(user.uid);
  expect(decoded.sub).toBe(user.sub);
  expect(decoded.aud).toBe(region_id);
  expect(decoded.email).toBe(user.email);
  expect(decoded.admin).toBe(user.admin);

  return true;
}

describe("Invalid JWT Audiences", () => {
  test("error thrown generating a token for an invalid audience", async () => {
    const invalid_region_ids: string[] = [
      "",
      "us-east1!", // invalid char
      "my-invalid-region_", // no underscores at end
      // @ts-expect-error Passing an invalid type on purpose for this test case
      69, // bad type
    ];

    for (const invalid_region_id of invalid_region_ids) {
      const parsed = audienceSchema.safeParse(invalid_region_id);
      expect(
        parsed.success,
        `Region ID '${invalid_region_id}' was interpreted as valid, when it should be invalid!`,
      ).toBeFalse();
    }

    const results: boolean[] = await Promise.all(
      invalid_region_ids.map(async (region_id: string): Promise<boolean> => {
        try {
          return await isGenerateAndDecodeTokenForStorageRegionSuccess(
            region_id,
          );
        } catch (e: unknown) {
          void e;
          return false;
        }
      }),
    );

    expect(
      results.every((result) => typeof result === "boolean" && !result),
      "Expected token generation/decoding to fail for each invalid storage region ID!",
    ).toBeTrue();
  });
});
