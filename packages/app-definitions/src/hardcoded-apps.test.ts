import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { apiServerIdSchema } from "./api-server-id";
import { schemaVaultsApiServerDefinitionSchema } from "./api-server-definition";
import { DEFAULT_AUTH_SERVER_APP_ID } from "./get-auth-server-app-id";
import {
  getHardcodedApiDomains,
  getHardcodedApiServer,
  getHardcodedApiServerIds,
  isHardcodedApiServerId,
} from "./hardcoded-apis";
import { getHardcodedApp, getHardcodedAppIds } from "./hardcoded-apps";
import { OIDC_USERINFO_AUDIENCE_ID } from "./oidc-userinfo-audience";

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
    expect(getHardcodedApiServerIds()).toEqual([
      "acme-corp-auth",
      OIDC_USERINFO_AUDIENCE_ID,
    ]);

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

  test("oidc-userinfo audience is a reserved hardcoded API server", () => {
    expect(apiServerIdSchema.safeParse(OIDC_USERINFO_AUDIENCE_ID).success).toBe(
      true,
    );
    expect(getHardcodedApiServerIds()).toContain(OIDC_USERINFO_AUDIENCE_ID);
    expect(isHardcodedApiServerId(OIDC_USERINFO_AUDIENCE_ID)).toBe(true);

    const api = getHardcodedApiServer(OIDC_USERINFO_AUDIENCE_ID);
    const parsed = schemaVaultsApiServerDefinitionSchema.safeParse(api);
    expect(parsed.success).toBe(true);
    expect(api.api_server_id).toBe(OIDC_USERINFO_AUDIENCE_ID);
    expect(api.hardcoded).toBe(true);
    // Not publicly listed: ordinary apps must not be able to self-serve
    // APP_TO_API_PERMISSIONS rows for the OIDC audience via connect_app.
    expect(api.public).toBe(false);
    expect(api.api_server_name).toBe("SchemaVaults Auth OIDC UserInfo");
  });

  test("oidc-userinfo API name reflects (and clamps) the friendly-name override", () => {
    process.env.SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME = "AcmeCorp Auth";
    expect(getHardcodedApiServer(OIDC_USERINFO_AUDIENCE_ID).api_server_name).toBe(
      "AcmeCorp Auth OIDC UserInfo",
    );

    process.env.SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME = "X".repeat(100);
    const clamped = getHardcodedApiServer(
      OIDC_USERINFO_AUDIENCE_ID,
    ).api_server_name;
    expect(clamped).toHaveLength(64);
  });

  test("oidc-userinfo audience is served on the auth server's own domain", () => {
    const domains = getHardcodedApiDomains(OIDC_USERINFO_AUDIENCE_ID);
    expect(domains).toHaveLength(1);
    expect(domains[0]!.api_server_id).toBe(OIDC_USERINFO_AUDIENCE_ID);
    expect(domains[0]!.domain).toBe(
      getHardcodedApiDomains(DEFAULT_AUTH_SERVER_APP_ID)[0]!.domain,
    );
  });
});
