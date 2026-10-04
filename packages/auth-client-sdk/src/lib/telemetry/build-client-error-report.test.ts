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
    // Objects are never serialized: only their key names, or a string `message`.
    expect(buildClientErrorReport({ code: 42, body: { secret: "s" } }, {}, environment)).toMatchObject({
      name: "UnknownError",
      message: "Non-Error object with keys: code, body",
    });
    expect(buildClientErrorReport({ name: "HttpError", message: "Bad gateway" }, {}, environment)).toMatchObject({
      name: "HttpError",
      message: "Bad gateway",
    });
  });

  test("never sends a token response attached as a non-Error cause", () => {
    // The shape openid-client (oauth4webapi) throws when it rejects a token
    // response: an OperationProcessingError whose `cause` holds the body.
    const rejected = new Error('"response" body "scope" property must be a string', {
      cause: { body: { access_token: "AT_SECRET", refresh_token: "RT_SECRET", id_token: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1In0.c2ln", scope: 1 } },
    });
    const claimsRejected = new Error('unexpected JWT "exp" (expiration time) claim value', {
      cause: { claims: { email: "user@example.com", nonce: "n" }, claim: "exp" },
    });
    for (const root of [rejected, claimsRejected]) {
      const wrapped = new Error("Failed to exchange authorization code for access token: x", { cause: root });
      const report = buildClientErrorReport(wrapped, { operation: "handleSuccessfulAuthentication" }, environment);
      const sent = JSON.stringify(report);
      for (const secret of ["AT_SECRET", "RT_SECRET", "eyJzdWIiOiJ1In0", "user@example.com"]) {
        expect(sent).not.toContain(secret);
      }
      expect(report.stack).toContain(`Caused by: Error: ${root.message}`);
    }
    expect(buildClientErrorReport(new Error("x", { cause: rejected }), {}, environment).stack).toContain(
      "Caused by: UnknownError: Non-Error object with keys: body",
    );
  });

  test("redacts credentials in the message, stack and context", () => {
    const error = new Error('Request failed: {"refresh_token":"RT_SECRET"} Authorization: Bearer AT_SECRET_123');
    error.stack = `Error: GET https://api.example.com/x?access_token=AT_SECRET_456 failed\n    at f (app.js:1:1)`;
    const report = buildClientErrorReport(
      error,
      { context: { status: 401, headers: { authorization: "Bearer x" }, password: "pw" } },
      environment,
    );
    expect(JSON.stringify(report)).not.toMatch(/SECRET|"pw"|Bearer x/);
    expect(report.message).toBe('Request failed: {"refresh_token":"[redacted]"} Authorization: [redacted] [redacted]');
    expect(report.stack).toContain("?access_token=[redacted] failed");
    expect(report.context).toEqual({ status: 401, headers: { authorization: "[redacted]" }, password: "[redacted]" });
    expect(clientErrorReportSchema.safeParse(report).success).toBe(true);
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
