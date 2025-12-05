
import { describe, expect, it } from "bun:test";
import MockUser from "./MockUser";
import { type GenerateJWTOptions, generateJWT } from "@/jwt/generate";
import { SCHEMAVAULTS_CLI } from "@schemavaults/app-definitions";
import { generateNewJwtKeySet } from "@/jwt/jwt_keys";
import { decodeJWT } from "@/jwt/decode";
import { AccessToken, AuthToken } from "@schemavaults/auth-common";

const user = new MockUser();

describe("UserOrganizationsInJwt", () => {
  it("should return the user's organizations", async () => {
    const audience = crypto.randomUUID();
    const jwt_keys = await generateNewJwtKeySet()

    const jwt: AccessToken = await generateJWT({
      type: "access",
      audience,
      iat: Date.now(),
      user,
      client_app_id: SCHEMAVAULTS_CLI.app_id,
      jwt_keys,
      env: 'test',
      orgs: ['org1', 'org2'],
    });
    const decoded = await decodeJWT({
      audience,
      jwt_keys,
      jwt: jwt.token,
      env: 'test',
      type: 'access'
    });
    expect(decoded.orgs).toBeArrayOfSize(2)
    expect(decoded.orgs).toContain('org1')
    expect(decoded.orgs).toContain('org2')
  });
});
