import { decodeJWT, generateNewJwtKeySet, type JWT_Keys } from "@/jwt";
import {
  SCHEMAVAULTS_MAIL_APP_DEFINITION,
  SCHEMAVAULTS_WEB,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { describe, test, expect } from "bun:test";
import { MockUser } from "@/tests/MockUser";
import { generateJWT, type GenerateJWTOptions } from "@/jwt/generate";

const env: SchemaVaultsAppEnvironment = "test";

async function isGenerateAndDecodeTokenForMailServerSuccess(
  client_app_id: string = SCHEMAVAULTS_MAIL_APP_DEFINITION.app_id,
): Promise<boolean> {
  const audience = SCHEMAVAULTS_MAIL_APP_DEFINITION.app_id;
  const audience_id: string = audience;

  const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
    audience_id,
  });

  const user = new MockUser();
  const now = Date.now();

  const generateOptions: GenerateJWTOptions<"access"> = {
    type: "access",
    user,
    audience,
    iat: now,
    client_app_id,
    jwt_keys,
    env,
    orgs: [],
  };

  const jwt = await generateJWT(generateOptions);
  const decoded = await decodeJWT({
    jwt: jwt.token,
    type: "access",
    jwt_keys,
    audience,
    env,
  });

  expect(decoded.uid).toBe(user.uid);
  expect(decoded.sub).toBe(user.sub);
  expect(decoded.aud).toBe(audience);
  expect(decoded.email).toBe(user.email);
  expect(decoded.admin).toBe(user.admin);

  return true;
}

describe("JWTs for SchemaVaults Mail Server", () => {
  test("Access JWT with a mail server audience and client app ID can be generated and decoded", async () => {
    const success: boolean =
      await isGenerateAndDecodeTokenForMailServerSuccess();

    expect(success).toBeTrue();
  });

  test("Access JWT with a mail server audience and core web app ID can be generated and decoded", async () => {
    const success: boolean = await isGenerateAndDecodeTokenForMailServerSuccess(
      SCHEMAVAULTS_WEB.app_id,
    );

    expect(success).toBeTrue();
  });
});
