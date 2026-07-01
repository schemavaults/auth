import { describe, it, expect } from "bun:test";

import { type GenerateJWTOptions, generateJWT } from "./generate";
import { decodeJWT } from "./decode";
import { type UserData } from "@schemavaults/auth-common";
import getRefreshTokenAudience from "./get_refresh_token_audience";
import {
  getAuthServerUrl,
  SCHEMAVAULTS_AUTH_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { generateNewJwtKeySet, type JWT_Keys } from "./jwt_keys";
import MockUser from "@/tests/MockUser";

const env: "test" = "test" as const satisfies SchemaVaultsAppEnvironment;
const environment = env;
const auth_server_url: string = getAuthServerUrl(env);

describe("JWT Generation & Decoding", () => {
  it("should generate and decode a refresh token JWT", async () => {
    const user: UserData = new MockUser();
    const now = Date.now();

    const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
      audience_id: SCHEMAVAULTS_AUTH_APP_ID,
      environment,
    });

    const audience: string = getRefreshTokenAudience(env);
    const generateOptions: GenerateJWTOptions<"refresh"> = {
      type: "refresh",
      user,
      audience,
      iat: now,
      client_app_id: SCHEMAVAULTS_AUTH_APP_ID,
      auth_server_url,
      jwt_keys,
      env,
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

  it("should generate and decode an access token JWT for auth server", async () => {
    const user = new MockUser();
    const now = Date.now();

    const client_app_id = SCHEMAVAULTS_AUTH_APP_ID;
    const audience: string = getAuthServerUrl(env);

    const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
      audience_id: SCHEMAVAULTS_AUTH_APP_ID,
      environment,
    });

    const generateOptions: GenerateJWTOptions<"access"> = {
      type: "access",
      user,
      audience,
      iat: now,
      client_app_id,
      auth_server_url,
      jwt_keys,
      env,
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

  it("should include a jti claim on generated refresh tokens", async () => {
    const user: UserData = new MockUser();
    const now = Date.now();

    const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
      audience_id: SCHEMAVAULTS_AUTH_APP_ID,
      environment,
    });

    const audience: string = getRefreshTokenAudience(env);
    const generateOptions: GenerateJWTOptions<"refresh"> = {
      type: "refresh",
      user,
      audience,
      iat: now,
      client_app_id: SCHEMAVAULTS_AUTH_APP_ID,
      auth_server_url,
      jwt_keys,
      env,
    };

    const jwt = await generateJWT(generateOptions);

    // jti should be present on the generated token object
    expect(jwt.jti).toBeDefined();
    expect(typeof jwt.jti).toBe("string");

    // Decode and verify jti is in the payload
    const decoded = await decodeJWT({
      jwt: jwt.token,
      type: "refresh",
      jwt_keys,
      env,
    });

    expect(decoded.jti).toBe(jwt.jti);
  });

  it("should include a jti claim on generated access tokens", async () => {
    const user = new MockUser();
    const now = Date.now();

    const client_app_id = SCHEMAVAULTS_AUTH_APP_ID;
    const audience = getAuthServerUrl(env);

    const jwt_keys: JWT_Keys = await generateNewJwtKeySet({
      audience_id: SCHEMAVAULTS_AUTH_APP_ID,
      environment,
    });

    const generateOptions: GenerateJWTOptions<"access"> = {
      type: "access",
      user,
      audience,
      iat: now,
      client_app_id,
      auth_server_url,
      jwt_keys,
      env,
    };

    const jwt = await generateJWT(generateOptions);

    expect(jwt.jti).toBeDefined();
    expect(typeof jwt.jti).toBe("string");

    const decoded = await decodeJWT({
      jwt: jwt.token,
      type: "access",
      audience,
      jwt_keys,
      env,
    });

    expect(decoded.jti).toBe(jwt.jti);
  });

  it("should throw an error attempting to generate refresh token for non-auth server audience", async () => {
    const user: UserData = new MockUser();
    const now = Date.now();

    const auth_app_id = SCHEMAVAULTS_AUTH_APP_ID;

    const jwt_keys_for_auth_app: JWT_Keys = await generateNewJwtKeySet({
      audience_id: auth_app_id,
      environment,
    });

    const random_app_id: string = crypto.randomUUID();
    const random_api_id: string = crypto.randomUUID();

    const generateOptions: GenerateJWTOptions<"refresh"> = {
      type: "refresh",
      user,
      audience: random_api_id,
      iat: now,
      auth_server_url,
      client_app_id: random_app_id,
      jwt_keys: jwt_keys_for_auth_app, // intentionally mismatched keyset <=> audience to create error
      env,
    };

    let errorThrown: boolean = false;
    try {
      await generateJWT(generateOptions);
    } catch (e: unknown) {
      void e;
      errorThrown = true;
    }
    expect(errorThrown).toBeTrue();
  });

  it("should throw an error generating access token using keys from mismatched audience", async () => {
    const user: UserData = new MockUser();
    const now = Date.now();

    const jwt_keys_audience_id = crypto.randomUUID();
    const jwt_keys_for_mismatched_audience = await generateNewJwtKeySet({
      audience_id: jwt_keys_audience_id,
      environment,
    });

    const random_app_id: string = crypto.randomUUID();
    const random_api_id: string = crypto.randomUUID();

    expect(jwt_keys_audience_id).not.toBe(random_api_id);

    const generateOptions: GenerateJWTOptions<"access"> = {
      type: "access",
      user,
      audience: random_api_id,
      iat: now,
      client_app_id: random_app_id,
      jwt_keys: jwt_keys_for_mismatched_audience,
      auth_server_url,
      env,
    };

    let errorThrown: boolean = false;
    try {
      await generateJWT(generateOptions);
    } catch (e: unknown) {
      void e;
      errorThrown = true;
    }
    expect(
      errorThrown,
      "Expected an error to be thrown, but one was not!",
    ).toBeTrue();
  });

  it("should throw an error generating access token for external API server using auth server keys", async () => {
    const user: UserData = new MockUser();
    const now = Date.now();

    const jwt_keys_for_auth_server = await generateNewJwtKeySet({
      audience_id: SCHEMAVAULTS_AUTH_APP_ID,
      environment,
    });

    const random_app_id: string = crypto.randomUUID();
    const random_api_id: string = crypto.randomUUID();

    expect(auth_server_url).not.toBe(random_api_id);

    const generateOptions: GenerateJWTOptions<"access"> = {
      type: "access",
      user,
      audience: random_api_id,
      iat: now,
      client_app_id: random_app_id,
      auth_server_url,
      jwt_keys: jwt_keys_for_auth_server,
      env,
    };

    let errorThrown: boolean = false;
    try {
      await generateJWT(generateOptions);
    } catch (e: unknown) {
      void e;
      errorThrown = true;
    }
    expect(
      errorThrown,
      "Expected an error to be thrown, but one was not!",
    ).toBeTrue();
  });
});
