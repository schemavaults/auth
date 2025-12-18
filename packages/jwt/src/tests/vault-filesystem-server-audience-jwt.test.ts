import { decodeJWT, generateNewJwtKeySet, type JWT_Keys } from "@/jwt";
import {
  SCHEMAVAULTS_CLI,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { describe, test, expect } from "bun:test";
import { MockUser } from "@/tests/MockUser";
import { generateJWT, type GenerateJWTOptions } from "@/jwt/generate";
import { audienceRefSchema } from "@schemavaults/auth-common";
import isValidUuid from "@/utils/isValidUuid";

const env: SchemaVaultsAppEnvironment = "test";

async function isGenerateAndDecodeTokenForStorageRegionSuccess(
  region_id: string,
): Promise<boolean> {
  const user = new MockUser();
  const now = Date.now();
  expect(isValidUuid(region_id)).toBe(true);

  const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
    audience_id: region_id,
  });

  const generateOptions: GenerateJWTOptions<"access"> = {
    type: "access",
    user,
    audience: region_id,
    iat: now,
    client_app_id: SCHEMAVAULTS_CLI.app_id,
    jwt_keys,
    env,
    orgs: [],
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

describe("JWTs for Vault FileSystem", () => {
  test("Access JWT with a fs server audience can be generated and decoded", async () => {
    const region_ids = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ] as const satisfies readonly string[];

    for (const region_id of region_ids) {
      expect(
        audienceRefSchema.safeParse(region_id).success,
        `Expected every example storage region IDs to be valid, but "${region_id}" is not valid.`,
      ).toBeTrue();
    }

    const results: boolean[] = await Promise.all(
      region_ids.map(async (region_id: string): Promise<boolean> => {
        return await isGenerateAndDecodeTokenForStorageRegionSuccess(region_id);
      }),
    );

    expect(results.every((result) => !!result)).toBeTrue();
  });

  test("error thrown generating a token for an invalid FS server audience", async () => {
    const invalid_region_ids: string[] = [
      "",
      "us-east1", // region id should just be a uuid
      "us-east1!", // invalid char
      "my-invalid-region_", // invalid char
      // @ts-expect-error Passing an invalid type on purpose for this test case
      69, // bad type
      "01e0eagd-434c-4dc7-bff4-ddz488b62528", // almost a uuid but with invalid chars
    ];

    expect(
      invalid_region_ids.every((region_id): boolean => {
        return !audienceRefSchema.safeParse(region_id).success;
      }),
      "Expected every example storage region ID to be invalid",
    ).toBeTrue();

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
