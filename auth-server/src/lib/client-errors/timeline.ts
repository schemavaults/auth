const HOUR_MS: number = 60 * 60 * 1000;
const DAY_MS: number = 24 * HOUR_MS;

/** Bucket widths a client errors timeline may use, narrowest first. */
export const CLIENT_ERROR_TIMELINE_BUCKETS_MS: readonly number[] = [
  HOUR_MS,
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  7 * DAY_MS,
  30 * DAY_MS,
];

/** Most buckets a timeline draws. */
export const MAX_CLIENT_ERROR_TIMELINE_BUCKETS: number = 90;

/** The narrowest bucket width that covers `span_ms` in at most {@link MAX_CLIENT_ERROR_TIMELINE_BUCKETS} buckets. */
export function chooseTimelineBucketMs(span_ms: number): number {
  const span: number = Math.max(0, span_ms);
  for (const bucket_ms of CLIENT_ERROR_TIMELINE_BUCKETS_MS) {
    if (Math.ceil(span / bucket_ms) <= MAX_CLIENT_ERROR_TIMELINE_BUCKETS) {
      return bucket_ms;
    }
  }
  return CLIENT_ERROR_TIMELINE_BUCKETS_MS[CLIENT_ERROR_TIMELINE_BUCKETS_MS.length - 1]!;
}

/** Start of the bucket holding `instant_ms` (buckets are aligned to the Unix epoch). */
export function bucketStart(instant_ms: number, bucket_ms: number): number {
  return Math.floor(instant_ms / bucket_ms) * bucket_ms;
}

export interface ClientErrorTimelineBucket {
  /** Bucket start (Unix epoch ms). */
  start: number;
  count: number;
}

/**
 * Every bucket from the one holding `from_ms` to the one holding `to_ms`,
 * with the counts of `counted` (keyed by bucket start) and 0 elsewhere.
 */
export function fillTimeline(
  from_ms: number,
  to_ms: number,
  bucket_ms: number,
  counted: ReadonlyMap<number, number>,
): ClientErrorTimelineBucket[] {
  const buckets: ClientErrorTimelineBucket[] = [];
  const first: number = bucketStart(Math.min(from_ms, to_ms), bucket_ms);
  const last: number = bucketStart(Math.max(from_ms, to_ms), bucket_ms);
  for (let start = first; start <= last; start += bucket_ms) {
    buckets.push({ start, count: counted.get(start) ?? 0 });
  }
  return buckets;
}
