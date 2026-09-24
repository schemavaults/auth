import { describe, expect, test } from "bun:test";
import {
  DEFAULT_AUTH_SERVER_FRIENDLY_NAME,
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID,
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME,
} from "@schemavaults/app-definitions";
import {
  describeAuthServerApi,
  isWhiteLabelDeployment,
  type AuthServerDeploymentIdentity,
} from "./api-document-description";

const SCHEMAVAULTS: AuthServerDeploymentIdentity = {
  friendlyName: DEFAULT_AUTH_SERVER_FRIENDLY_NAME,
  ownerOrganizationId: DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID,
  ownerOrganizationName: DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME,
};

const ACME: AuthServerDeploymentIdentity = {
  friendlyName: "Acme Identity",
  ownerOrganizationId: "acme",
  ownerOrganizationName: "Acme Corp",
};

describe("isWhiteLabelDeployment", () => {
  test("the default configuration is SchemaVaults' own instance", () => {
    expect(isWhiteLabelDeployment(SCHEMAVAULTS)).toBe(false);
  });

  test("any rebranded or re-homed setting makes it white-label", () => {
    expect(isWhiteLabelDeployment({ ...SCHEMAVAULTS, friendlyName: "Acme Identity" })).toBe(true);
    expect(isWhiteLabelDeployment({ ...SCHEMAVAULTS, ownerOrganizationId: "acme" })).toBe(true);
    expect(isWhiteLabelDeployment({ ...SCHEMAVAULTS, ownerOrganizationName: "Acme Corp" })).toBe(true);
  });
});

describe("describeAuthServerApi", () => {
  test("SchemaVaults' own instance", () => {
    const description = describeAuthServerApi(SCHEMAVAULTS);
    expect(description).toStartWith(
      `HTTP API of ${DEFAULT_AUTH_SERVER_FRIENDLY_NAME}, SchemaVaults' own instance of @schemavaults/auth-server:`,
    );
    expect(description).not.toContain("not SchemaVaults'");
  });

  test("a white-label instance names its operator and disclaims SchemaVaults", () => {
    const paragraphs = describeAuthServerApi(ACME).split("\n\n");
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toStartWith("HTTP API of Acme Identity:");
    expect(paragraphs[0]).not.toContain("SchemaVaults");
    expect(paragraphs[1]).toStartWith(
      "Acme Identity is an instance of @schemavaults/auth-server operated by Acme Corp. It is not SchemaVaults' own instance",
    );
  });

  test("a white-label instance without an owner organization name is not attributed to SchemaVaults", () => {
    const description = describeAuthServerApi({ ...SCHEMAVAULTS, friendlyName: "Acme Identity" });
    expect(description).toContain("Acme Identity is an instance of @schemavaults/auth-server operated independently.");
    expect(description).not.toContain(`operated by ${DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME}`);
  });
});
