import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  getAuthServerAppId,
} from "./get-auth-server-app-id";

const ENV_KEY = "SCHEMAVAULTS_AUTH_SERVER_APP_ID";

describe("getAuthServerAppId", () => {
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
    expect(getAuthServerAppId()).toBe(DEFAULT_AUTH_SERVER_APP_ID);
  });

  test("returns the default when the environment variable is empty", () => {
    process.env[ENV_KEY] = "";
    expect(getAuthServerAppId()).toBe(DEFAULT_AUTH_SERVER_APP_ID);
  });

  test("returns the configured app ID", () => {
    process.env[ENV_KEY] = "acme-corp-auth";
    expect(getAuthServerAppId()).toBe("acme-corp-auth");
  });

  test("strips wrapping quotes and whitespace", () => {
    process.env[ENV_KEY] = ' "acme-corp-auth" ';
    expect(getAuthServerAppId()).toBe("acme-corp-auth");
  });

  test("throws for an uppercase app ID", () => {
    process.env[ENV_KEY] = "AcmeCorpAuth";
    expect(() => getAuthServerAppId()).toThrow();
  });

  test("throws for a too-short app ID", () => {
    process.env[ENV_KEY] = "a";
    expect(() => getAuthServerAppId()).toThrow();
  });

  test("throws for an app ID with a trailing hyphen", () => {
    process.env[ENV_KEY] = "acme-corp-auth-";
    expect(() => getAuthServerAppId()).toThrow();
  });
});
