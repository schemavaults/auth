import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  buildClientErrorReport,
  type ReportErrorOptions,
} from "./build-client-error-report";

export interface ClientErrorReporterOptions {
  adapter: Pick<ISchemaVaultsAuthClientAdapter, "fetch">;
  auth_server_url: string;
  client_app_id: string;
  app_env: SchemaVaultsAppEnvironment;
  sdk_version: string;
  /** `disable_telemetry`: when true nothing is ever sent. */
  disabled: boolean;
  debug: boolean;
  /** The signed-in user's uid, when known. Must not throw. */
  getCurrentUid: () => string | null;
  /** Absolute URL of the current page; defaults to `globalThis.location.href`. */
  getPageUrl?: () => string | undefined;
  now?: () => number;
}

/** Why {@link ClientErrorReporter.send} did not send a report. */
export type ClientErrorReportSkipReason =
  | "disabled"
  | "already_reported"
  | "duplicate"
  | "session_limit"
  | "backoff"
  | "failed";

export type ClientErrorReportOutcome =
  | { sent: true; status: number }
  | { sent: false; reason: ClientErrorReportSkipReason };

/** How many `cause` links are checked for an already reported error. */
const MAX_CAUSE_DEPTH: number = 5;

function defaultPageUrl(): string | undefined {
  try {
    const location: unknown = (globalThis as { location?: unknown }).location;
    if (location && typeof location === "object" && "href" in location && typeof location.href === "string") {
      return location.href;
    }
  } catch {
    // no page (Node, workers without location access)
  }
  return undefined;
}

/**
 * Sends errors to the auth server's client error intake
 * (`POST /api/client-errors/{client_app_id}`), Sentry style: fire and
 * forget, never throwing, and bounded so that a failure loop cannot flood
 * the server.
 *
 * - nothing is sent when `disabled` (`disable_telemetry`);
 * - the same Error object is reported once, however many SDK layers it
 *   passes through (also when a layer wraps it as the `cause` of a new one);
 * - an error with the same name, message and operation is reported at most
 *   once per {@link ClientErrorReporter.DEDUPE_WINDOW_MS};
 * - at most {@link ClientErrorReporter.MAX_REPORTS} reports leave one
 *   reporter (one page load, usually);
 * - after a 429 nothing is sent until `Retry-After` has passed.
 *
 * Reports are sent as `text/plain` JSON without credentials: a CORS simple
 * request, so the browser sends no preflight, and `keepalive` so a report
 * sent while the page unloads (a login redirect, say) still arrives.
 */
export class ClientErrorReporter {
  public static readonly MAX_REPORTS: number = 25;
  public static readonly DEDUPE_WINDOW_MS: number = 60_000;
  /** Backoff when a 429 carries no usable `Retry-After`. */
  public static readonly DEFAULT_BACKOFF_MS: number = 60_000;

  private readonly opts: ClientErrorReporterOptions;
  private readonly reported: WeakSet<object> = new WeakSet<object>();
  private readonly lastSentAt: Map<string, number> = new Map<string, number>();
  private sentCount: number = 0;
  private backoffUntil: number = 0;

  public constructor(opts: ClientErrorReporterOptions) {
    this.opts = opts;
  }

  public get enabled(): boolean {
    return !this.opts.disabled;
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private get endpoint(): string {
    return new URL(
      `/api/client-errors/${encodeURIComponent(this.opts.client_app_id)}`,
      this.opts.auth_server_url,
    ).toString();
  }

  /**
   * Marks `error` and its `cause` chain as reported; returns true when one
   * of them already was (an SDK layer that wraps an already-reported error
   * in a new one must not report it twice).
   */
  private markReported(error: unknown): boolean {
    const chain: object[] = [];
    let current: unknown = error;
    for (let depth = 0; depth <= MAX_CAUSE_DEPTH && typeof current === "object" && current !== null; depth++) {
      if (this.reported.has(current)) return true;
      chain.push(current);
      current = current instanceof Error ? current.cause : undefined;
    }
    for (const link of chain) this.reported.add(link);
    return false;
  }

  /** Reports `error` in the background. Never throws, never rejects. */
  public report(error: unknown, options: ReportErrorOptions = {}): void {
    void this.send(error, options);
  }

  /** Reports `error` and resolves with what happened. Never rejects. */
  public async send(error: unknown, options: ReportErrorOptions = {}): Promise<ClientErrorReportOutcome> {
    try {
      return await this.trySend(error, options);
    } catch (e: unknown) {
      if (this.opts.debug) {
        console.warn("[SchemaVaultsAuthClient] Failed to report a client error:", e);
      }
      return { sent: false, reason: "failed" };
    }
  }

  private async trySend(error: unknown, options: ReportErrorOptions): Promise<ClientErrorReportOutcome> {
    if (this.opts.disabled) {
      return { sent: false, reason: "disabled" };
    }

    if (this.markReported(error)) {
      return { sent: false, reason: "already_reported" };
    }

    const now: number = this.now();
    if (now < this.backoffUntil) {
      return { sent: false, reason: "backoff" };
    }
    if (this.sentCount >= ClientErrorReporter.MAX_REPORTS) {
      return { sent: false, reason: "session_limit" };
    }

    let uid: string | null = null;
    try {
      uid = this.opts.getCurrentUid();
    } catch {
      uid = null;
    }
    const report = buildClientErrorReport(error, options, {
      sdk_version: this.opts.sdk_version,
      app_env: this.opts.app_env,
      page_url: (this.opts.getPageUrl ?? defaultPageUrl)(),
      uid,
      now,
    });

    const dedupeKey: string = `${report.name}\n${report.message}\n${report.operation ?? ""}`;
    const last: number | undefined = this.lastSentAt.get(dedupeKey);
    if (last !== undefined && now - last < ClientErrorReporter.DEDUPE_WINDOW_MS) {
      return { sent: false, reason: "duplicate" };
    }
    this.lastSentAt.set(dedupeKey, now);
    this.sentCount += 1;

    const response: Response = await this.opts.adapter.fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(report),
      credentials: "omit",
      keepalive: true,
    });

    if (response.status === 429) {
      const retryAfterSeconds: number = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
      this.backoffUntil =
        now +
        (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : ClientErrorReporter.DEFAULT_BACKOFF_MS);
    }
    if (this.opts.debug && !response.ok) {
      console.warn(
        `[SchemaVaultsAuthClient] The auth server refused a client error report (HTTP ${response.status}).`,
      );
    }
    return { sent: true, status: response.status };
  }
}

export default ClientErrorReporter;
