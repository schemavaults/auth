import { describe, expect, test } from "bun:test";
import defaultGetAppEnvironment, {
  getAppEnvironment,
} from "./get-app-environment";
import type { SchemaVaultsAppEnvironment } from "@/app-environments";

describe("Test App Environment", () => {
  test("getAppEnvironment() returns 'test' during unit tests", () => {
    const app_environment: SchemaVaultsAppEnvironment = getAppEnvironment();
    expect(app_environment).toBe("test");
  });

  test("default export and named export both return 'test' during unit tests", () => {
    expect(getAppEnvironment()).toBe("test");
    expect(defaultGetAppEnvironment()).toBe("test");
  });
});
