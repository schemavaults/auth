import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  isOrganizationOwnedResource,
  isPlatformOwnedResource,
  isUserOwnedResource,
  platformOwnership,
  resolveResourceOwnership,
} from "./resource-ownership";
import { schemaVaultsAppDefinitionSchema } from "./client-app-definition";
import { schemaVaultsApiServerDefinitionSchema } from "./api-server-definition";
import { getHardcodedSchemaVaultsApps } from "./hardcoded-apps";
import { getHardcodedSchemaVaultsApis } from "./hardcoded-apis";

const UID = "6f1d2c3b-4a5e-4f60-9b7c-8d9e0f1a2b3c";

describe("resolveResourceOwnership", () => {
  let savedOwnerOrg: string | undefined;

  beforeEach(() => {
    savedOwnerOrg = process.env.SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION;
    delete process.env.SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION;
  });

  afterEach(() => {
    if (typeof savedOwnerOrg === "string") {
      process.env.SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION = savedOwnerOrg;
    } else {
      delete process.env.SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION;
    }
  });

  test("explicit owner_type wins", () => {
    expect(resolveResourceOwnership({ owner_type: "platform" })).toEqual({
      owner_type: "platform",
      owner_organization_id: "schemavaults",
      owner_uid: null,
    });
    expect(
      resolveResourceOwnership({
        owner_type: "organization",
        owner_organization_id: "acme",
      }),
    ).toEqual({
      owner_type: "organization",
      owner_organization_id: "acme",
      owner_uid: null,
    });
    expect(
      resolveResourceOwnership({ owner_type: "user", owner_uid: UID }),
    ).toEqual({ owner_type: "user", owner_organization_id: null, owner_uid: UID });
  });

  test("legacy definitions without owner_type are interpreted the old way", () => {
    // NULL / missing owner organization used to mean platform-owned
    expect(resolveResourceOwnership({}).owner_type).toBe("platform");
    expect(
      resolveResourceOwnership({ owner_organization_id: null }).owner_type,
    ).toBe("platform");
    // The platform's own virtual organization is platform ownership too
    expect(
      resolveResourceOwnership({ owner_organization_id: "schemavaults" })
        .owner_type,
    ).toBe("platform");
    expect(
      resolveResourceOwnership({ owner_organization_id: "acme" }),
    ).toEqual({
      owner_type: "organization",
      owner_organization_id: "acme",
      owner_uid: null,
    });
    expect(resolveResourceOwnership({ owner_uid: UID }).owner_type).toBe(
      "user",
    );
  });

  test("platform ownership reports the configured owner organization", () => {
    process.env.SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION = "acme-corp";
    expect(
      resolveResourceOwnership({ owner_type: "platform" }).owner_organization_id,
    ).toBe("acme-corp");
    // and a legacy row naming the platform org resolves to platform
    expect(
      resolveResourceOwnership({ owner_organization_id: "acme-corp" })
        .owner_type,
    ).toBe("platform");
    // browser code passes the id from context instead of the env var
    expect(
      resolveResourceOwnership(
        { owner_type: "platform" },
        { platform_owner_organization_id: "from-context" },
      ).owner_organization_id,
    ).toBe("from-context");
  });

  test("inconsistent explicit ownership throws", () => {
    expect(() =>
      resolveResourceOwnership({ owner_type: "user" }),
    ).toThrow(TypeError);
    expect(() =>
      resolveResourceOwnership({ owner_type: "organization" }),
    ).toThrow(TypeError);
    expect(() =>
      resolveResourceOwnership({ owner_type: "platform", owner_uid: UID }),
    ).toThrow(TypeError);
    expect(() =>
      resolveResourceOwnership({
        owner_type: "platform",
        owner_organization_id: "acme",
      }),
    ).toThrow(TypeError);
    expect(() =>
      resolveResourceOwnership({
        owner_type: "user",
        owner_uid: UID,
        owner_organization_id: "acme",
      }),
    ).toThrow(TypeError);
  });

  test("predicates", () => {
    expect(isPlatformOwnedResource({})).toBe(true);
    expect(isUserOwnedResource({ owner_type: "user", owner_uid: UID })).toBe(
      true,
    );
    expect(
      isOrganizationOwnedResource({ owner_organization_id: "acme" }),
    ).toBe(true);
    expect(platformOwnership("x")).toEqual({
      owner_type: "platform",
      owner_organization_id: "x",
      owner_uid: null,
    });
  });

  test("definition schemas accept the ownership fields", () => {
    const app = schemaVaultsAppDefinitionSchema.safeParse({
      app_id: "my-app",
      app_name: "My App",
      app_description: "",
      created_at: 1,
      public: false,
      hardcoded: false,
      web: true,
      owner_type: "user",
      owner_uid: UID,
      owner_organization_id: null,
      created_by: UID,
    });
    expect(app.success).toBe(true);

    const api = schemaVaultsApiServerDefinitionSchema.safeParse({
      api_server_id: "my-api",
      api_server_name: "My API",
      api_server_description: "",
      created_at: 1,
      public: false,
      hardcoded: false,
      owner_type: "bogus",
    });
    expect(api.success).toBe(false);
  });

  test("hardcoded definitions are platform-owned", () => {
    for (const app of getHardcodedSchemaVaultsApps()) {
      expect(resolveResourceOwnership(app).owner_type).toBe("platform");
      expect(app.owner_type).toBe("platform");
    }
    for (const api of getHardcodedSchemaVaultsApis()) {
      expect(resolveResourceOwnership(api).owner_type).toBe("platform");
      expect(api.owner_type).toBe("platform");
    }
  });
});
