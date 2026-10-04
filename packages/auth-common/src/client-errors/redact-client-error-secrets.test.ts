import { describe, expect, test } from "bun:test";
import {
  CLIENT_ERROR_REDACTED,
  isClientErrorSecretKey,
  redactClientErrorContext,
  redactClientErrorReport,
  redactClientErrorText,
} from "./redact-client-error-secrets";

const R = CLIENT_ERROR_REDACTED;
const JWS = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl";
const JWE = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..aXY.Y2lwaGVydGV4dA.dGFn";

describe("isClientErrorSecretKey", () => {
  test("matches credential-looking keys in any case or separator style", () => {
    for (const key of [
      "access_token",
      "refreshToken",
      "id_token",
      "client_secret",
      "Password",
      "Authorization",
      "Set-Cookie",
      "X-Api-Key",
      "code_verifier",
      "nonce",
      "body.otp",
    ]) {
      expect(isClientErrorSecretKey(key), key).toBe(true);
    }
  });

  test("leaves ordinary keys alone", () => {
    for (const key of ["status", "code", "operation", "message", "state", "url", "authenticated"]) {
      expect(isClientErrorSecretKey(key), key).toBe(false);
    }
  });
});

describe("redactClientErrorText", () => {
  test("redacts JWS and JWE compact tokens, also cut short", () => {
    expect(redactClientErrorText(`got ${JWS} back`)).toBe(`got ${R} back`);
    expect(redactClientErrorText(`got ${JWE} back`)).toBe(`got ${R} back`);
    expect(redactClientErrorText("cut eyJhbGciOiJSUzI1NiJ9.eyJzdWIi…")).toBe(`cut ${R}…`);
    // A lone header segment reveals nothing.
    expect(redactClientErrorText("eyJhbGciOiJSUzI1NiJ9")).toBe("eyJhbGciOiJSUzI1NiJ9");
  });

  test("redacts Authorization credentials", () => {
    expect(redactClientErrorText("Authorization: Bearer abcdefgh12345678")).toBe(`Authorization: ${R} ${R}`);
    expect(redactClientErrorText("sent Bearer abcdefgh12345678 to the API")).toBe(`sent Bearer ${R} to the API`);
  });

  test("redacts secret query parameters, also after a non-secret URL", () => {
    expect(redactClientErrorText("GET https://app.example.com/cb?code=abc123&state=xyz failed")).toBe(
      `GET https://app.example.com/cb?code=${R}&state=xyz failed`,
    );
    expect(redactClientErrorText("grant_type=refresh_token&refresh_token=rt.abc%2F123&client_id=app")).toBe(
      `grant_type=refresh_token&refresh_token=${R}&client_id=app`,
    );
  });

  test("redacts JSON members under secret keys, keeping the quotes", () => {
    const body = JSON.stringify({ body: { access_token: "AT", refresh_token: "RT", token_type: "bearer", scope: 1 } });
    expect(redactClientErrorText(body)).toBe(
      `{"body":{"access_token":"${R}","refresh_token":"${R}","token_type":"${R}","scope":1}}`,
    );
    // Stringified twice (escaped quotes), and a value with spaces.
    expect(redactClientErrorText(JSON.stringify(JSON.stringify({ password: "two words", user: "a" })))).toBe(
      `"{\\"password\\":\\"${R}\\",\\"user\\":\\"a\\"}"`,
    );
    // Cut short by truncation.
    expect(redactClientErrorText('{"refresh_token":"abcdef')).toBe(`{"refresh_token":"${R}`);
  });

  test("keeps ordinary error text, status codes and stack frames intact", () => {
    const stack =
      "Error: Token exchange failed: invalid_grant (HTTP 400)\n" +
      "    at exchangeAuthTokens (https://app.example.com/_next/static/chunks/exchange-auth-tokens.js:216:13)\n" +
      "    at async acquireAccessToken (webpack-internal:///./src/acquire-access-token.ts:42:7)";
    expect(redactClientErrorText(stack)).toBe(stack);
    expect(redactClientErrorText("Request failed, code: 500")).toBe("Request failed, code: 500");
    expect(redactClientErrorText('{"code":"ERR_NETWORK"}')).toBe('{"code":"ERR_NETWORK"}');
  });

  test("stays fast on adversarial input", () => {
    const inputs = [
      "a".repeat(64_000),
      "eyJ".repeat(20_000),
      'x:"'.repeat(20_000) + "\\",
      "token=".repeat(10_000),
      `a${" ".repeat(64_000)}`,
    ];
    for (const input of inputs) {
      const started = performance.now();
      redactClientErrorText(input);
      expect(performance.now() - started).toBeLessThan(500);
    }
  });
});

describe("redactClientErrorContext", () => {
  test("replaces members under secret keys and redacts nested strings", () => {
    expect(
      redactClientErrorContext({
        status: 401,
        headers: { Authorization: "Bearer x", "content-type": "application/json" },
        tokens: [{ value: "y" }],
        responses: [`token=${JWS}`, "ok"],
        code: "ERR_NETWORK",
      }),
    ).toEqual({
      status: 401,
      headers: { Authorization: R, "content-type": "application/json" },
      tokens: R,
      responses: [`token=${R}`, "ok"],
      code: "ERR_NETWORK",
    });
  });

  test("keeps a __proto__ member as data", () => {
    const context = JSON.parse('{"__proto__":{"password":"p"}}') as Record<string, unknown>;
    const redacted = redactClientErrorContext(context);
    expect(Object.getPrototypeOf(redacted)).toBe(Object.prototype);
    expect(JSON.stringify(redacted)).toBe(`{"__proto__":{"password":"${R}"}}`);
  });

  test("does not keep context nested too deep to inspect", () => {
    let deep: Record<string, unknown> = { secret_in_disguise: "s" };
    for (let i = 0; i < 40; i++) deep = { next: deep };
    expect(JSON.stringify(redactClientErrorContext(deep))).not.toContain('"s"');
  });
});

describe("redactClientErrorReport", () => {
  test("redacts message, stack and context, and nothing else", () => {
    const report = {
      name: "OperationProcessingError",
      message: `unexpected token_type, body: {"access_token":"AT"}`,
      stack: `Caused by: ${JWS}`,
      operation: "handleSuccessfulAuthentication",
      page_url: "https://app.example.com/cb",
      context: { refresh_token: "RT" },
    };
    expect(redactClientErrorReport(report)).toEqual({
      ...report,
      message: `unexpected token_type, body: {"access_token":"${R}"}`,
      stack: `Caused by: ${R}`,
      context: { refresh_token: R },
    });
    expect(redactClientErrorReport({ name: "Error", message: "boom" })).toEqual({ name: "Error", message: "boom" });
  });
});
