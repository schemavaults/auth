/** Display formatting shared by the client errors dashboard. */

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** 1,284 below ten thousand, 12.9K above. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.abs(value) < 10_000 ? integer.format(value) : compact.format(value);
}

/** `1 error`, `12 errors`. */
export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

const HOUR_MS: number = 60 * 60 * 1000;
const DAY_MS: number = 24 * HOUR_MS;

/** A timeline bucket in the viewer's timezone: `Oct 3, 14:00 – 17:00`, `Oct 3`, `Sep 29 – Oct 5`. */
export function formatTimelineBucket(start: number, bucket_ms: number): string {
  const from = new Date(start);
  const to = new Date(start + bucket_ms);
  const day = (date: Date): string => date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = (date: Date): string =>
    date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (bucket_ms < DAY_MS) return `${day(from)}, ${time(from)} – ${time(to)}`;
  if (bucket_ms === DAY_MS) return day(from);
  return `${day(from)} – ${day(new Date(start + bucket_ms - 1))}`;
}

/** Start of a timeline in the viewer's timezone: `Oct 3, 14:00` for sub-day buckets, `Oct 3` otherwise. */
export function formatTimelineStart(start: number, bucket_ms: number): string {
  const date = new Date(start);
  const day: string = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (bucket_ms >= DAY_MS) return day;
  return `${day}, ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

/** Width of a timeline bucket in words: `1 hour`, `12 hours`, `1 day`, `7 days`. */
export function describeBucketWidth(bucket_ms: number): string {
  if (bucket_ms < DAY_MS) {
    const hours: number = Math.round(bucket_ms / HOUR_MS);
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  const days: number = Math.round(bucket_ms / DAY_MS);
  return days === 1 ? "1 day" : `${days} days`;
}

/** `Error: message` as one line. */
export function describeError(name: string, message: string): string {
  return message ? `${name}: ${message}` : name;
}
