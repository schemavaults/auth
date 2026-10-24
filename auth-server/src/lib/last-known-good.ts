import "server-only";
import reportServerException from "@/lib/reportServerException";

export interface LastKnownGoodLookupOptions<T> {
  /** Names the lookup in the console and as the ERRORS table `op_name`. */
  name: string;
  /** The lookup itself, e.g. a database / Redis read. */
  load: () => Promise<T>;
  /** Answered while the lookup has never succeeded on this server instance. */
  fallback: T;
  /**
   * How long a caller waits for the lookup before it is answered the last
   * known good value. The lookup keeps running and still updates that value
   * when it eventually settles.
   */
  timeout_ms: number;
  /**
   * After a failure or a timeout, answer the last known good value without
   * starting another lookup for this long, so an outage costs one bounded
   * wait per window rather than one per request.
   */
  retry_after_ms: number;
}

type LookupOutcome<T> = { ok: true; value: T } | { ok: false };

const TIMED_OUT: unique symbol = Symbol("timed out");

function waitAtMost<R>(
  promise: Promise<R>,
  ms: number,
): Promise<R | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Wraps a lookup that a page render needs but can do without (server
 * settings, branding versions) so a database / Redis outage degrades the
 * page instead of failing or stalling it. Every call still runs the lookup
 * (values stay as fresh as before), but a failed or slow one answers the
 * value of the last lookup that succeeded on this server instance, or
 * `fallback` before any did. Concurrent callers share one lookup in flight.
 * Failures are recorded to the ERRORS table at most once a minute.
 */
export function createLastKnownGoodLookup<T>(
  opts: LastKnownGoodLookupOptions<T>,
): () => Promise<T> {
  const { name, load, fallback, timeout_ms, retry_after_ms } = opts;

  let last_known_good: { value: T } | null = null;
  let in_flight: Promise<LookupOutcome<T>> | null = null;
  let retry_at: number = 0;

  function recordFailure(e: unknown, answered: string): void {
    retry_at = Date.now() + retry_after_ms;
    console.error(`[${name}] Lookup failed, answering the ${answered}:`, e);
    // Not awaited: recording opens a database handle of its own, which can
    // be exactly what is down, and the render must not wait on it.
    void reportServerException(e, {
      op_name: name,
      context: { nonFatal: true, answered },
      throttle_ms: 60_000,
    });
  }

  function answered(): string {
    return last_known_good !== null ? "last known good value" : "fallback";
  }

  async function runLookup(): Promise<LookupOutcome<T>> {
    try {
      const value: T = await load();
      last_known_good = { value };
      retry_at = 0;
      return { ok: true, value };
    } catch (e: unknown) {
      recordFailure(e, answered());
      return { ok: false };
    }
  }

  function startLookup(): Promise<LookupOutcome<T>> {
    if (in_flight === null) {
      const started: Promise<LookupOutcome<T>> = runLookup();
      in_flight = started;
      // runLookup() never rejects, so neither does this.
      void started.finally((): void => {
        if (in_flight === started) {
          in_flight = null;
        }
      });
    }
    return in_flight;
  }

  return async function lookup(): Promise<T> {
    if (Date.now() < retry_at) {
      return last_known_good !== null ? last_known_good.value : fallback;
    }
    const outcome = await waitAtMost(startLookup(), timeout_ms);
    if (outcome === TIMED_OUT) {
      recordFailure(
        new Error(`${name} did not answer within ${timeout_ms}ms`),
        answered(),
      );
    } else if (outcome.ok) {
      return outcome.value;
    }
    return last_known_good !== null ? last_known_good.value : fallback;
  };
}

export default createLastKnownGoodLookup;
