import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_AUTH_SERVER_APP_ID } from "./get-auth-server-app-id";
import { getHardcodedApiServer, getHardcodedApiServerIds } from "./hardcoded-apis";
import { getHardcodedApp, getHardcodedAppIds } from "./hardcoded-apps";

const ENV_KEYS = [
  "SCHEMAVAULTS_AUTH_SERVER_APP_ID",
  "SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION",
  "SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME",
  "SCHEMAVAULTS_AUTH_SERVER_DESCRIPTION",
] as const;

describe("hardcoded app/API definitions", () => {
  let savedEnvValues: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnvValues = {};
    for (const key of ENV_KEYS) {
      savedEnvValues[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const saved = savedEnvValues[key];
      if (typeof saved === "string") {
        process.env[key] = saved;
      } else {
        delete process.env[key];
      }
    }
  });

  test("defaults match the SchemaVaults branding", () => {
    const app = getHardcodedApp(DEFAULT_AUTH_SERVER_APP_ID);
    expect(app.owner_organization_id).toBe("schemavaults");
    expect(app.app_name).toBe("SchemaVaults Auth");
  });

  test("app definition reflects environment variable overrides", () => {
    process.env.SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION = "acme-corp";
    process.env.SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME = "AcmeCorp Auth";
    process.env.SCHEMAVAULTS_AUTH_SERVER_DESCRIPTION = "Auth for AcmeCorp";

    const app = getHardcodedApp(DEFAULT_AUTH_SERVER_APP_ID);
    expect(app.app_id).toBe(DEFAULT_AUTH_SERVER_APP_ID);
    expect(app.owner_organization_id).toBe("acme-corp");
    expect(app.app_name).toBe("AcmeCorp Auth");
    expect(app.app_description).toBe("Auth for AcmeCorp");
  });

  test("API definition reflects environment variable overrides", () => {
    process.env.SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION = "acme-corp";
    process.env.SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME = "AcmeCorp Auth";

    const api = getHardcodedApiServer(DEFAULT_AUTH_SERVER_APP_ID);
    expect(api.api_server_id).toBe(DEFAULT_AUTH_SERVER_APP_ID);
    expect(api.owner_organization_id).toBe("acme-corp");
    expect(api.api_server_name).toBe("AcmeCorp Auth");
  });

  test("app id reflects the SCHEMAVAULTS_AUTH_SERVER_APP_ID override", () => {
    process.env.SCHEMAVAULTS_AUTH_SERVER_APP_ID = "acme-corp-auth";

    expect(getHardcodedAppIds()).toEqual(["acme-corp-auth"]);
    expect(getHardcodedApiServerIds()).toEqual(["acme-corp-auth"]);

    const app = getHardcodedApp("acme-corp-auth");
    expect(app.app_id).toBe("acme-corp-auth");

    const api = getHardcodedApiServer("acme-corp-auth");
    expect(api.api_server_id).toBe("acme-corp-auth");

    expect(() => getHardcodedApp(DEFAULT_AUTH_SERVER_APP_ID)).toThrow();
  });

  test("returns a fresh object per call", () => {
    const first = getHardcodedApp(DEFAULT_AUTH_SERVER_APP_ID);
    const second = getHardcodedApp(DEFAULT_AUTH_SERVER_APP_ID);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});
