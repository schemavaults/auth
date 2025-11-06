import { describe, expect, test } from "bun:test";
import { getAppEnvironment } from "./get-app-environment";
import type { SchemaVaultsAppEnvironment } from "./app-environments";

describe("Test App Environment", () => {
  test("getAppEnvironment() returns 'test' during unit tests", () => {
    const app_environment: SchemaVaultsAppEnvironment = getAppEnvironment();
    expect(app_environment).toBe("test");
  });
});
