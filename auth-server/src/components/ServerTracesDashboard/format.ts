/** Display formatting shared by the trace dashboard tiles. */

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** 1,284 below ten thousand, 12.9K above. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return Math.abs(value) < 10_000 ? integer.format(value) : compact.format(value);
}

function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** A duration in milliseconds: `12 ms`, `340 ms`, `1.24 s`, `2.5 min`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) {
    return "—";
  }
  if (ms < 10) {
    return `${trimZeros(ms.toFixed(1))} ms`;
  }
  if (ms < 1_000) {
    return `${Math.round(ms)} ms`;
  }
  if (ms < 60_000) {
    return `${trimZeros((ms / 1_000).toFixed(ms < 10_000 ? 2 : 1))} s`;
  }
  return `${trimZeros((ms / 60_000).toFixed(1))} min`;
}

/** A compact axis label for a duration: `0`, `5ms`, `250ms`, `1.5s`, `2m`. */
export function formatDurationTick(ms: number): string {
  if (!Number.isFinite(ms)) {
    return "";
  }
  if (ms === 0) {
    return "0";
  }
  if (ms < 1_000) {
    return `${trimZeros(ms.toPrecision(3))}ms`;
  }
  if (ms < 60_000) {
    return `${trimZeros((ms / 1_000).toPrecision(3))}s`;
  }
  return `${trimZeros((ms / 60_000).toPrecision(3))}m`;
}

/** A span of time: `45 s`, `12 min`, `3 h 12 min`, `2 d 4 h`. */
export function formatSpan(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "—";
  }
  const seconds: number = Math.round(ms / 1_000);
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes: number = Math.round(ms / 60_000);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours: number = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest: number = minutes % 60;
    return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days: number = Math.floor(hours / 24);
  const rest: number = hours % 24;
  return rest > 0 ? `${days} d ${rest} h` : `${days} d`;
}

/** A rate per minute: `0.4/min`, `12/min`, `1.2K/min`. */
export function formatRatePerMinute(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  if (value < 10) {
    return `${trimZeros(value.toFixed(value < 1 ? 2 : 1))}/min`;
  }
  return `${formatCount(Math.round(value))}/min`;
}

/**
 * A time-axis label for an instant, precise enough for the span the axis
 * covers: `14:05:30` within minutes, `14:05` within a day, `Sep 24 14:00`
 * beyond. Rendered in the viewer's time zone.
 */
export function formatTimeTick(ms: number, span_ms: number): string {
  const date = new Date(ms);
  if (span_ms <= 10 * 60_000) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  if (span_ms <= 24 * 3_600_000) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** A full timestamp: `Sep 24, 14:05:30.123` (or `Sep 24, 14:05:30` without milliseconds). */
export function formatInstant(ms: number, with_milliseconds: boolean = true): string {
  const date = new Date(ms);
  const base: string = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return with_milliseconds
    ? `${base}.${String(date.getMilliseconds()).padStart(3, "0")}`
    : base;
}

/** `42%`, or one decimal for slivers so a real-but-tiny share never reads as `0%`. */
export function formatShare(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) {
    return "0%";
  }
  const percent: number = fraction * 100;
  return percent < 1 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`;
}
