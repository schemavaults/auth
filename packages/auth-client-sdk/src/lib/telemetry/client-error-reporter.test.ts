import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { ClientErrorReporter, type ClientErrorReporterOptions } from "./client-error-reporter";
import { isExpectedAuthClientError } from "./expected-errors";

/** `RequestInit | undefined`, as the adapter's fetch takes it. */
type FetchInit = Parameters<ISchemaVaultsAuthClientAdapter["fetch"]>[1];

interface RecordedRequest {
  url: string;
  init: FetchInit;
}

function createReporter(
  overrides: Partial<ClientErrorReporterOptions> = {},
  respond: () => Response | Promise<Response> = () => new Response(null, { status: 202 }),
) {
  const requests: RecordedRequest[] = [];
  let now = 1_000_000;
  const reporter = new ClientErrorReporter({
    adapter: {
      fetch: async (url: string, init: FetchInit): Promise<Response> => {
        requests.push({ url, init });
        return await respond();
      },
    },
    auth_server_url: "https://auth.example.com",
    client_app_id: "my-web-app",
    app_env: "production",
    sdk_version: "0.21.0",
    disabled: false,
    debug: false,
    getCurrentUid: () => null,
    getPageUrl: () => "https://app.example.com/page?secret=1",
    now: () => now,
    ...overrides,
  });
  return {
    reporter,
    requests,
    advance: (ms: number): void => {
      now += ms;
    },
  };
}

describe("ClientErrorReporter", () => {
  test("posts the report as a CORS simple request without credentials", async () => {
    const { reporter, requests } = createReporter();
    expect(await reporter.send(new Error("boom"), { operation: "login" })).toEqual({ sent: true, status: 202 });
    expect(requests).toHaveLength(1);
    const { url, init } = requests[0]!;
    expect(url).toBe("https://auth.example.com/api/client-errors/my-web-app");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("omit");
    expect(init?.keepalive).toBe(true);
    expect(new Headers(init?.headers).get("Content-Type")).toBe("text/plain;charset=UTF-8");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ name: "Error", message: "boom", operation: "login", page_url: "https://app.example.com/page" });
  });

  test("sends nothing when disabled", async () => {
    const { reporter, requests } = createReporter({ disabled: true });
    expect(reporter.enabled).toBe(false);
    expect(await reporter.send(new Error("boom"))).toEqual({ sent: false, reason: "disabled" });
    reporter.report(new Error("boom"));
    await Promise.resolve();
    expect(requests).toHaveLength(0);
  });

  test("reports an error object once, also when wrapped as a cause", async () => {
    const { reporter, requests } = createReporter();
    const inner = new Error("inner");
    expect((await reporter.send(inner)).sent).toBe(true);
    expect(await reporter.send(inner)).toEqual({ sent: false, reason: "already_reported" });
    expect(await reporter.send(new Error("outer", { cause: inner }))).toEqual({ sent: false, reason: "already_reported" });
    expect(requests).toHaveLength(1);
  });

  test("deduplicates equal errors within the window", async () => {
    const { reporter, requests, advance } = createReporter();
    expect((await reporter.send(new Error("same"), { operation: "op" })).sent).toBe(true);
    expect(await reporter.send(new Error("same"), { operation: "op" })).toEqual({ sent: false, reason: "duplicate" });
    expect((await reporter.send(new Error("same"), { operation: "other-op" })).sent).toBe(true);
    advance(ClientErrorReporter.DEDUPE_WINDOW_MS);
    expect((await reporter.send(new Error("same"), { operation: "op" })).sent).toBe(true);
    expect(requests).toHaveLength(3);
  });

  test("stops after the per-reporter limit", async () => {
    const { reporter, requests } = createReporter();
    for (let i = 0; i < ClientErrorReporter.MAX_REPORTS; i++) {
      expect((await reporter.send(new Error(`error ${i}`))).sent).toBe(true);
    }
    expect(await reporter.send(new Error("one more"))).toEqual({ sent: false, reason: "session_limit" });
    expect(requests).toHaveLength(ClientErrorReporter.MAX_REPORTS);
  });

  test("backs off for Retry-After after a 429", async () => {
    const { reporter, requests, advance } = createReporter(
      {},
      () => new Response(null, { status: 429, headers: { "Retry-After": "30" } }),
    );
    expect(await reporter.send(new Error("a"))).toEqual({ sent: true, status: 429 });
    advance(29_000);
    expect(await reporter.send(new Error("b"))).toEqual({ sent: false, reason: "backoff" });
    advance(1_000);
    expect((await reporter.send(new Error("c"))).sent).toBe(true);
    expect(requests).toHaveLength(2);
  });

  test("stops for good after a 403 or 404", async () => {
    for (const status of [403, 404]) {
      const { reporter, requests, advance } = createReporter({}, () => new Response(null, { status }));
      expect(await reporter.send(new Error("a"))).toEqual({ sent: true, status });
      expect(reporter.isStopped).toBe(true);
      advance(24 * 60 * 60 * 1000);
      expect(await reporter.send(new Error("b"))).toEqual({ sent: false, reason: "stopped" });
      expect(requests).toHaveLength(1);
    }
  });

  test("backs off after a 503 (storage full), for Retry-After or an hour", async () => {
    const withHeader = createReporter({}, () => new Response(null, { status: 503, headers: { "Retry-After": "120" } }));
    await withHeader.reporter.send(new Error("a"));
    withHeader.advance(119_000);
    expect(await withHeader.reporter.send(new Error("b"))).toEqual({ sent: false, reason: "backoff" });
    withHeader.advance(1_000);
    expect((await withHeader.reporter.send(new Error("c"))).sent).toBe(true);

    const withoutHeader = createReporter({}, () => new Response(null, { status: 503 }));
    await withoutHeader.reporter.send(new Error("a"));
    withoutHeader.advance(ClientErrorReporter.DEFAULT_UNAVAILABLE_BACKOFF_MS - 1);
    expect(await withoutHeader.reporter.send(new Error("b"))).toEqual({ sent: false, reason: "backoff" });
    expect(withoutHeader.reporter.isStopped).toBe(false);
  });

  test("stops after consecutive network failures, which a success resets", async () => {
    let fail = true;
    const { reporter, requests } = createReporter({}, () => {
      if (fail) throw new TypeError("Failed to fetch");
      return new Response(null, { status: 202 });
    });
    for (let i = 1; i < ClientErrorReporter.MAX_CONSECUTIVE_FAILURES; i++) {
      expect(await reporter.send(new Error(`fail ${i}`))).toEqual({ sent: false, reason: "failed" });
    }
    fail = false;
    expect((await reporter.send(new Error("ok"))).sent).toBe(true);
    fail = true;
    for (let i = 1; i <= ClientErrorReporter.MAX_CONSECUTIVE_FAILURES; i++) {
      await reporter.send(new Error(`fail again ${i}`));
    }
    expect(reporter.isStopped).toBe(true);
    expect(await reporter.send(new Error("after"))).toEqual({ sent: false, reason: "stopped" });
    expect(requests).toHaveLength(2 * ClientErrorReporter.MAX_CONSECUTIVE_FAILURES);
  });

  test("never throws when the request or the uid lookup fails", async () => {
    const { reporter } = createReporter(
      {
        getCurrentUid: () => {
          throw new Error("storage unavailable");
        },
      },
      () => {
        throw new TypeError("Failed to fetch");
      },
    );
    expect(await reporter.send(new Error("boom"))).toEqual({ sent: false, reason: "failed" });
    expect(() => reporter.report(new Error("again"))).not.toThrow();
  });
});

describe("isExpectedAuthClientError", () => {
  test("recognizes session lifecycle errors, also as causes", () => {
    expect(isExpectedAuthClientError(new Error("No refresh token available to acquire new access token!"))).toBe(true);
    expect(
      isExpectedAuthClientError(
        new Error("Failed to exchange refresh token for access token", {
          cause: new Error("Session expired: the auth server no longer recognizes this session"),
        }),
      ),
    ).toBe(true);
    expect(isExpectedAuthClientError(new Error("Failed to load current user data from whoami API!"))).toBe(false);
    expect(isExpectedAuthClientError("No refresh token available")).toBe(false);
  });
});
