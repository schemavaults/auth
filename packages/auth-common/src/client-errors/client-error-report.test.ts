import { describe, expect, test } from "bun:test";
import {
  CLIENT_ERROR_REPORT_LIMITS,
  clientErrorReportSchema,
} from "./client-error-report";

describe("clientErrorReportSchema", () => {
  test("accepts a minimal report", () => {
    const parsed = clientErrorReportSchema.safeParse({ name: "Error", message: "boom" });
    expect(parsed.success).toBe(true);
  });

  test("accepts a full report and drops unknown members", () => {
    const parsed = clientErrorReportSchema.safeParse({
      name: "TypeError",
      message: "x is undefined",
      stack: "TypeError: x is undefined\n    at f (app.js:1:1)",
      operation: "acquireAccessToken",
      occurred_at: 1_700_000_000_000,
      sdk_name: "@schemavaults/auth-client-sdk",
      sdk_version: "0.21.0",
      app_env: "production",
      page_url: "https://app.example.com/dashboard",
      reported_uid: "8b0c7a3e-5f8e-4a51-9b5c-1d2e3f4a5b6c",
      context: { status: 500 },
      future_field: true,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("future_field");
  });

  test("refuses an empty name", () => {
    expect(clientErrorReportSchema.safeParse({ name: "", message: "boom" }).success).toBe(false);
  });

  test("refuses an over-long message", () => {
    const message = "x".repeat(CLIENT_ERROR_REPORT_LIMITS.message + 1);
    expect(clientErrorReportSchema.safeParse({ name: "Error", message }).success).toBe(false);
  });

  test("refuses an unknown app environment", () => {
    expect(
      clientErrorReportSchema.safeParse({ name: "Error", message: "boom", app_env: "prod" }).success,
    ).toBe(false);
  });

  test("refuses a reported_uid that is not a uuid", () => {
    expect(
      clientErrorReportSchema.safeParse({ name: "Error", message: "boom", reported_uid: "alice" }).success,
    ).toBe(false);
  });

  test("refuses a context too large to store", () => {
    const context = { blob: "x".repeat(CLIENT_ERROR_REPORT_LIMITS.context_json) };
    expect(clientErrorReportSchema.safeParse({ name: "Error", message: "boom", context }).success).toBe(false);
  });

  test("refuses a context that is not an object", () => {
    expect(
      clientErrorReportSchema.safeParse({ name: "Error", message: "boom", context: ["a"] }).success,
    ).toBe(false);
  });
});
