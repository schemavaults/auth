import { decodeJWT, generateNewJwtKeySet, getAudienceFromToken } from "@/jwt";
import { generateJWT } from "@/jwt/generate";
import { AccessToken, getAuthServerUrl } from "@schemavaults/auth-common";
import { describe, expect, test } from "bun:test";
import MockUser from "./MockUser";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

const env: SchemaVaultsAppEnvironment = "test";
const auth_server_url = getAuthServerUrl(env);

describe("Token 'aud' Header Claim", () => {
  test("", async () => {
    const audience_id = auth_server_url;
    const client_app_id = auth_server_url;

    const jwt_keys = await generateNewJwtKeySet({
      audience_id,
      environment: env,
    });

    const jwt: AccessToken = await generateJWT({
      type: "access",
      audience: audience_id,
      iat: Date.now(),
      user: new MockUser(),
      client_app_id,
      auth_server_url,
      jwt_keys,
      env: "test",
    });

    expect(getAudienceFromToken(jwt.token)).toBe(audience_id);

    const decoded = await decodeJWT({
      audience: audience_id,
      jwt_keys,
      jwt: jwt.token,
      env: "test",
      type: "access",
    });

    expect(decoded.aud).toBe(auth_server_url);
  });
});
