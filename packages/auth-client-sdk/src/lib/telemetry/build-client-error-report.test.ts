import { describe, expect, test } from "bun:test";
import { CLIENT_ERROR_REPORT_LIMITS, clientErrorReportSchema } from "@schemavaults/auth-common";
import {
  AUTH_CLIENT_SDK_NAME,
  buildClientErrorReport,
  stripPageUrl,
} from "./build-client-error-report";

const environment = {
  sdk_version: "0.21.0",
  app_env: "production",
  page_url: "https://app.example.com/auth/callback?code=secret-code&state=abc#frag",
  uid: "8b0c7a3e-5f8e-4a51-9b5c-1d2e3f4a5b6c",
  now: 1_700_000_000_000,
} as const;

describe("buildClientErrorReport", () => {
  test("describes an Error, without the page's query string", () => {
    const report = buildClientErrorReport(new TypeError("x is undefined"), { operation: "acquireAccessToken" }, environment);
    expect(report).toMatchObject({
      name: "TypeError",
      message: "x is undefined",
      operation: "acquireAccessToken",
      occurred_at: environment.now,
      sdk_name: AUTH_CLIENT_SDK_NAME,
      sdk_version: "0.21.0",
      app_env: "production",
      page_url: "https://app.example.com/auth/callback",
      reported_uid: environment.uid,
    });
    expect(report.stack).toContain("x is undefined");
    expect(JSON.stringify(report)).not.toContain("secret-code");
    expect(clientErrorReportSchema.safeParse(report).success).toBe(true);
  });

  test("appends the cause chain to the stack", () => {
    const root = new Error("ECONNRESET");
    const report = buildClientErrorReport(new Error("Token exchange failed", { cause: root }), {}, environment);
    expect(report.stack).toContain("Token exchange failed");
    expect(report.stack).toContain("Caused by: Error: ECONNRESET");
  });

  test("describes thrown non-errors", () => {
    expect(buildClientErrorReport("plain string", {}, environment)).toMatchObject({
      name: "UnknownError",
      message: "plain string",
    });
    expect(buildClientErrorReport({ code: 42 }, {}, environment).message).toBe('{"code":42}');
  });

  test("truncates every field to what the server accepts", () => {
    const error = new Error("m".repeat(10_000));
    error.name = "N".repeat(1_000);
    error.stack = "s".repeat(100_000);
    const report = buildClientErrorReport(error, { operation: "o".repeat(1_000) }, environment);
    expect(report.name.length).toBe(CLIENT_ERROR_REPORT_LIMITS.name);
    expect(report.message.length).toBe(CLIENT_ERROR_REPORT_LIMITS.message);
    expect(report.stack!.length).toBe(CLIENT_ERROR_REPORT_LIMITS.stack);
    expect(report.operation!.length).toBe(CLIENT_ERROR_REPORT_LIMITS.operation);
    expect(clientErrorReportSchema.safeParse(report).success).toBe(true);
  });

  test("drops a context the server would refuse", () => {
    const huge = buildClientErrorReport(new Error("x"), { context: { blob: "x".repeat(20_000) } }, environment);
    expect(huge.context).toEqual({ context_dropped: `larger than ${CLIENT_ERROR_REPORT_LIMITS.context_json} characters` });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(buildClientErrorReport(new Error("x"), { context: cyclic }, environment).context).toEqual({
      context_dropped: "not JSON-serializable",
    });
    expect(buildClientErrorReport(new Error("x"), { context: { status: 500 } }, environment).context).toEqual({ status: 500 });
  });

  test("leaves out a user id that is not a uuid, and pages that are not http(s)", () => {
    const report = buildClientErrorReport(new Error("x"), {}, { ...environment, uid: "not-a-uuid", page_url: "file:///x" });
    expect(report).not.toHaveProperty("reported_uid");
    expect(report).not.toHaveProperty("page_url");
  });
});

describe("stripPageUrl", () => {
  test("keeps origin and path only", () => {
    expect(stripPageUrl("http://localhost:3000/a/b?x=1#y")).toBe("http://localhost:3000/a/b");
    expect(stripPageUrl("not a url")).toBeUndefined();
    expect(stripPageUrl(undefined)).toBeUndefined();
  });
});
