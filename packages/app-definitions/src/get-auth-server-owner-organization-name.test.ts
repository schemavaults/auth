import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME,
  getAuthServerOwnerOrganizationName,
} from "./get-auth-server-owner-organization-name";

const ENV_KEY = "SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION_NAME";

describe("getAuthServerOwnerOrganizationName", () => {
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
    expect(getAuthServerOwnerOrganizationName()).toBe(
      DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_NAME,
    );
  });

  test("returns the configured organization name", () => {
    process.env[ENV_KEY] = "Acme Corp";
    expect(getAuthServerOwnerOrganizationName()).toBe("Acme Corp");
  });

  test("strips wrapping quotes", () => {
    process.env[ENV_KEY] = '"Acme Corp"';
    expect(getAuthServerOwnerOrganizationName()).toBe("Acme Corp");
  });
});
