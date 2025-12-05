import { describe, it, expect } from "bun:test";

import { type GenerateJWTOptions, generateJWT } from "./generate";
import { decodeJWT } from "./decode";
import {
  isValidOrganizationID,
  type OrganizationID,
  type UserData,
} from "@schemavaults/auth-common";
import { REFRESH_TOKEN_AUDIENCE } from "./aud";
import {
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { generateNewJwtKeySet, type JWT_Keys } from "./jwt_keys";
import { MockUser } from "@/tests/MockUser";

const jwt_keys: JWT_Keys = await generateNewJwtKeySet();

const env: SchemaVaultsAppEnvironment = "test";

describe("JWT", () => {
  it("should generate and decode a refresh token JWT", async () => {
    const user: UserData = new MockUser();
    const now = Date.now();

    const audience = REFRESH_TOKEN_AUDIENCE;
    const generateOptions: GenerateJWTOptions<"refresh"> = {
      type: "refresh",
      user,
      audience,
      iat: now,
      client_app_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      jwt_keys,
      env,
      orgs: [],
    };

    const jwt = await generateJWT(generateOptions);
    const decoded = await decodeJWT({
      jwt: jwt.token,
      type: "refresh",
      jwt_keys,
      env,
    });

    expect(decoded.aud).toBe(audience);
    expect(decoded.sub).toBe(user.uid);
  });

  it("should generate and decode an access token JWT", async () => {
    const user = new MockUser();
    const now = Date.now();

    const client_app_id = crypto.randomUUID();
    const audience = crypto.randomUUID();

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
      audience,
      jwt_keys,
      env,
    });

    expect(decoded.sub).toBe(user.uid);
    expect(decoded.aud).toBe(audience);
    expect(decoded.app).toBe(client_app_id);
  });

  it("organization IDs are preserved after generating and decoding an access token JWT", async () => {
    const user = new MockUser();
    const now = Date.now();

    const client_app_id = crypto.randomUUID();
    const audience = crypto.randomUUID();
    const organization_id: OrganizationID = "my-organization";

    expect(isValidOrganizationID(organization_id)).toBeTrue();

    const generateOptions: GenerateJWTOptions<"access"> = {
      type: "access",
      user,
      audience,
      iat: now,
      client_app_id,
      jwt_keys,
      env,
      orgs: [organization_id],
    };

    const jwt = await generateJWT(generateOptions);
    const decoded = await decodeJWT({
      jwt: jwt.token,
      type: "access",
      audience,
      jwt_keys,
      env,
    });

    expect(Array.isArray(decoded.orgs)).toBeTrue();
    expect(decoded.orgs.length).toBe(1);
    expect(decoded.orgs[0]).toBe(organization_id);
  });
});
