import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID,
  getAuthServerOwnerOrganizationId,
} from "./get-auth-server-owner-organization-id";

const ENV_KEY = "SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION";

describe("getAuthServerOwnerOrganizationId", () => {
  let savedEnvValue: string | undefined;

  beforeEach(() => {
    savedEnvValue = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (typeof savedEnvValue === "string") {
      process.env[ENV_KEY] = savedEnvValue;
    } else {
      delete process.env[ENV_KEY];
    }
  });

  test("returns the default when the environment variable is unset", () => {
    expect(getAuthServerOwnerOrganizationId()).toBe(
      DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID,
    );
  });

  test("returns the default when the environment variable is empty", () => {
    process.env[ENV_KEY] = "";
    expect(getAuthServerOwnerOrganizationId()).toBe(
      DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID,
    );
  });

  test("returns the configured organization ID", () => {
    process.env[ENV_KEY] = "acme-corp";
    expect(getAuthServerOwnerOrganizationId()).toBe("acme-corp");
  });

  test("strips wrapping quotes and whitespace", () => {
    process.env[ENV_KEY] = ' "acme-corp" ';
    expect(getAuthServerOwnerOrganizationId()).toBe("acme-corp");
  });

  test("throws for an uppercase organization ID", () => {
    process.env[ENV_KEY] = "AcmeCorp";
    expect(() => getAuthServerOwnerOrganizationId()).toThrow();
  });

  test("throws for a too-short organization ID", () => {
    process.env[ENV_KEY] = "abc";
    expect(() => getAuthServerOwnerOrganizationId()).toThrow();
  });

  test("throws for a reserved organization ID route word", () => {
    process.env[ENV_KEY] = "create";
    expect(() => getAuthServerOwnerOrganizationId()).toThrow();
  });

  test("throws for an organization ID with a trailing hyphen", () => {
    process.env[ENV_KEY] = "acme-corp-";
    expect(() => getAuthServerOwnerOrganizationId()).toThrow();
  });
});
