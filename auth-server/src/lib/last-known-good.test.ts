import { describe, expect, mock, test } from "bun:test";

// Failures are recorded through reportServerException, which opens a
// database handle of its own; capture the calls instead.
const reported: { err: unknown; opts: { op_name?: string; context?: unknown } }[] = [];
const report = async (
  err: unknown,
  opts: { op_name?: string; context?: unknown } = {},
): Promise<void> => {
  reported.push({ err, opts });
};
mock.module("@/lib/reportServerException", () => ({
  default: report,
  reportServerException: report,
}));

const { createLastKnownGoodLookup } = await import("./last-known-good");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A load() whose next answer the test sets, counting its calls. */
function scriptedLoad() {
  const state = {
    calls: 0,
    next: async (): Promise<string> => "fresh",
  };
  return {
    state,
    load: async (): Promise<string> => {
      state.calls += 1;
      return await state.next();
    },
  };
}

describe("createLastKnownGoodLookup", () => {
  test("answers the lookup's value while it succeeds, running it on every call", async () => {
    const { state, load } = scriptedLoad();
    const lookup = createLastKnownGoodLookup({
      name: "test.fresh",
      load,
      fallback: "fallback",
      timeout_ms: 1_000,
      retry_after_ms: 10_000,
    });

    expect(await lookup()).toBe("fresh");
    state.next = async () => "fresher";
    expect(await lookup()).toBe("fresher");
    expect(state.calls).toBe(2);
  });

  test("answers the fallback when the lookup fails before ever succeeding, and records it", async () => {
    const { load, state } = scriptedLoad();
    state.next = async () => {
      throw new Error("database down");
    };
    const lookup = createLastKnownGoodLookup({
      name: "test.fallback",
      load,
      fallback: "fallback",
      timeout_ms: 1_000,
      retry_after_ms: 10_000,
    });

    expect(await lookup()).toBe("fallback");
    const recorded = reported.filter((r) => r.opts.op_name === "test.fallback");
    expect(recorded).toHaveLength(1);
    expect((recorded[0]!.err as Error).message).toBe("database down");
  });

  test("answers the last known good value when a later lookup fails", async () => {
    const { load, state } = scriptedLoad();
    const lookup = createLastKnownGoodLookup({
      name: "test.stale",
      load,
      fallback: "fallback",
      timeout_ms: 1_000,
      retry_after_ms: 10_000,
    });

    expect(await lookup()).toBe("fresh");
    state.next = async () => {
      throw new Error("database down");
    };
    expect(await lookup()).toBe("fresh");
  });

  test("does not start another lookup within retry_after_ms of a failure", async () => {
    const { load, state } = scriptedLoad();
    state.next = async () => {
      throw new Error("database down");
    };
    const lookup = createLastKnownGoodLookup({
      name: "test.backoff",
      load,
      fallback: "fallback",
      timeout_ms: 1_000,
      retry_after_ms: 50,
    });

    expect(await lookup()).toBe("fallback");
    expect(await lookup()).toBe("fallback");
    expect(state.calls).toBe(1);

    await sleep(60);
    state.next = async () => "recovered";
    expect(await lookup()).toBe("recovered");
    expect(state.calls).toBe(2);
  });

  test("stops waiting after timeout_ms, then picks up the slow lookup's value when it lands", async () => {
    const { load, state } = scriptedLoad();
    const lookup = createLastKnownGoodLookup({
      name: "test.timeout",
      load,
      fallback: "fallback",
      timeout_ms: 20,
      retry_after_ms: 10_000,
    });

    state.next = async () => {
      await sleep(80);
      return "slow";
    };
    const started: number = Date.now();
    expect(await lookup()).toBe("fallback");
    expect(Date.now() - started).toBeLessThan(70);
    expect(
      reported.some((r) => r.opts.op_name === "test.timeout"),
    ).toBe(true);

    // The timed-out lookup keeps running; once it succeeds its value is
    // answered and the retry back-off is lifted.
    await sleep(100);
    state.next = async () => "next";
    expect(await lookup()).toBe("next");
    expect(state.calls).toBe(2);
  });

  test("concurrent callers share one lookup in flight", async () => {
    const { load, state } = scriptedLoad();
    state.next = async () => {
      await sleep(10);
      return "shared";
    };
    const lookup = createLastKnownGoodLookup({
      name: "test.single-flight",
      load,
      fallback: "fallback",
      timeout_ms: 1_000,
      retry_after_ms: 10_000,
    });

    const answers = await Promise.all([lookup(), lookup(), lookup()]);
    expect(answers).toEqual(["shared", "shared", "shared"]);
    expect(state.calls).toBe(1);
  });

  test("a load() that throws synchronously still fails over and is retried later", async () => {
    let calls: number = 0;
    let fail: boolean = true;
    const lookup = createLastKnownGoodLookup<string>({
      name: "test.sync-throw",
      load: (): Promise<string> => {
        calls += 1;
        if (fail) {
          throw new Error("misconfigured");
        }
        return Promise.resolve("ok");
      },
      fallback: "fallback",
      timeout_ms: 1_000,
      retry_after_ms: 20,
    });

    expect(await lookup()).toBe("fallback");
    await sleep(30);
    fail = false;
    expect(await lookup()).toBe("ok");
    expect(calls).toBe(2);
  });
});
