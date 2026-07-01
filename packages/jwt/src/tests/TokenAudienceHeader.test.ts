import { decodeJWT, generateNewJwtKeySet, getAudienceFromToken } from "@/jwt";
import { generateJWT } from "@/jwt/generate";
import { AccessToken, getAuthServerUrl } from "@schemavaults/auth-common";
import { describe, expect, test } from "bun:test";
import MockUser from "./MockUser";
import {
  SCHEMAVAULTS_AUTH_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

const env: SchemaVaultsAppEnvironment = "test";
const auth_server_url = getAuthServerUrl(env);

describe("Token 'aud' Header Claim", () => {
  test("", async () => {
    // Keyset is stored/looked-up by the stable app id; the token `aud` is the URL.
    const audience_id = SCHEMAVAULTS_AUTH_APP_ID;
    const token_audience = auth_server_url;
    const client_app_id = SCHEMAVAULTS_AUTH_APP_ID;

    const jwt_keys = await generateNewJwtKeySet({
      audience_id,
      environment: env,
    });

    const jwt: AccessToken = await generateJWT({
      type: "access",
      audience: token_audience,
      iat: Date.now(),
      user: new MockUser(),
      client_app_id,
      auth_server_url,
      jwt_keys,
      env: "test",
    });

    expect(getAudienceFromToken(jwt.token)).toBe(token_audience);

    const decoded = await decodeJWT({
      audience: token_audience,
      jwt_keys,
      jwt: jwt.token,
      env: "test",
      type: "access",
    });

    expect(decoded.aud).toBe(auth_server_url);
  });
});
