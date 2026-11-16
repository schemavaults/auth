// How much time an authorization flow with a fixed expiry has left, as a
// pure function of the clock: what FlowExpiryCountdown renders, and what
// its tests pin.

/** The ring's colour, from calm to urgent. */
export type FlowExpiryTone = "default" | "warning" | "destructive";

export interface DescribeFlowExpiryOptions {
  /** The current time (Unix epoch ms). */
  now: number;
  /** When the flow expires (Unix epoch ms). */
  expires_at: number;
  /**
   * The flow's whole lifetime in ms, which a full ring stands for. Omit when
   * unknown: the ring is then measured against `fallback_duration_ms`.
   */
  duration_ms?: number;
  /** The lifetime to assume without `duration_ms` (typically what was left when the page loaded). */
  fallback_duration_ms?: number;
}

export interface FlowExpiry {
  /** Milliseconds left, never negative. */
  remaining_ms: number;
  /** Share of the lifetime left, 0..1 (the ring's fill). */
  fraction: number;
  expired: boolean;
  tone: FlowExpiryTone;
  /** What fits inside the ring: "59m", "4:07", "0:00". */
  compact_label: string;
  /** The remaining time in words: "about 59 minutes", "4 minutes 7 seconds". */
  spoken_label: string;
}

/** Below this much time left the ring turns amber... */
export const FLOW_EXPIRY_WARNING_MS = 2 * 60 * 1000;
/** ...and below this, red. */
export const FLOW_EXPIRY_CRITICAL_MS = 30 * 1000;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

function compactLabel(remaining_ms: number): string {
  const total_seconds: number = Math.ceil(remaining_ms / 1000);
  if (total_seconds >= 60 * 60) {
    return `${Math.floor(total_seconds / 3600)}h`;
  }
  if (total_seconds >= 10 * 60) {
    return `${Math.floor(total_seconds / 60)}m`;
  }
  const minutes: number = Math.floor(total_seconds / 60);
  const seconds: number = total_seconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function spokenLabel(remaining_ms: number): string {
  const total_seconds: number = Math.ceil(remaining_ms / 1000);
  if (total_seconds <= 0) {
    return "no time";
  }
  if (total_seconds >= 60 * 60) {
    const hours: number = Math.floor(total_seconds / 3600);
    const minutes: number = Math.floor((total_seconds % 3600) / 60);
    return minutes > 0
      ? `about ${plural(hours, "hour")} ${plural(minutes, "minute")}`
      : `about ${plural(hours, "hour")}`;
  }
  if (total_seconds >= 10 * 60) {
    return `about ${plural(Math.round(total_seconds / 60), "minute")}`;
  }
  const minutes: number = Math.floor(total_seconds / 60);
  const seconds: number = total_seconds % 60;
  if (minutes === 0) {
    return plural(seconds, "second");
  }
  return seconds === 0
    ? plural(minutes, "minute")
    : `${plural(minutes, "minute")} ${plural(seconds, "second")}`;
}

/**
 * Describes the time left before `expires_at`. The ring goes amber in the
 * last two minutes, or once a third of the lifetime is left if that comes
 * later for a short flow, and red in the last 30 seconds.
 */
export function describeFlowExpiry({
  now,
  expires_at,
  duration_ms,
  fallback_duration_ms,
}: DescribeFlowExpiryOptions): FlowExpiry {
  const remaining_ms: number = Math.max(0, expires_at - now);
  const lifetime: number = Math.max(
    1,
    duration_ms ?? fallback_duration_ms ?? remaining_ms,
  );
  const fraction: number = Math.min(1, remaining_ms / lifetime);
  const expired: boolean = remaining_ms <= 0;
  const warning_ms: number = Math.min(FLOW_EXPIRY_WARNING_MS, lifetime / 3);
  const tone: FlowExpiryTone =
    expired || remaining_ms <= FLOW_EXPIRY_CRITICAL_MS
      ? "destructive"
      : remaining_ms <= warning_ms
        ? "warning"
        : "default";
  return {
    remaining_ms,
    fraction,
    expired,
    tone,
    compact_label: compactLabel(remaining_ms),
    spoken_label: spokenLabel(remaining_ms),
  };
}

export default describeFlowExpiry;
