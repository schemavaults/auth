import { decodeJWT, generateNewJwtKeySet, getAudienceFromToken } from "@/jwt";
import { generateJWT } from "@/jwt/generate";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import { AccessToken } from "@schemavaults/auth-common";
import { describe, expect, test } from "bun:test";
import MockUser from "./MockUser";

describe("Token 'aud' Header Claim", () => {
  test("", async () => {
    const audience_id = SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id;
    const client_app_id = SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id;

    const jwt_keys = await generateNewJwtKeySet({
      audience_id,
    });

    const jwt: AccessToken = await generateJWT({
      type: "access",
      audience: audience_id,
      iat: Date.now(),
      user: new MockUser(),
      client_app_id,
      jwt_keys,
      env: "test",
      orgs: ["org1", "org2"],
    });

    expect(getAudienceFromToken(jwt.token)).toBe(audience_id);

    const decoded = await decodeJWT({
      audience: audience_id,
      jwt_keys,
      jwt: jwt.token,
      env: "test",
      type: "access",
    });

    expect(decoded.aud).toBe(SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id);
  });
});
