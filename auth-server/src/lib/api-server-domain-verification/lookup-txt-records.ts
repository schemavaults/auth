import "server-only";

import { Resolver } from "node:dns/promises";

/**
 * Result of looking up the TXT records of one name.
 *
 * - `records`: the name has TXT records (each joined from its
 *   character-strings, RFC 7208 §3.3 style).
 * - `no_records`: the name does not exist (NXDOMAIN) or has no TXT records
 *   (NODATA). Authoritative: verifications that relied on a record there
 *   no longer hold.
 * - `lookup_failed`: no authoritative answer (timeout, SERVFAIL, refused,
 *   no network). Nothing about the name may be concluded.
 */
export type TxtLookupResult =
  | { kind: "records"; records: string[] }
  | { kind: "no_records" }
  | { kind: "lookup_failed"; code: string };

/** Resolves a name's TXT records as `node:dns` does (chunks per record). */
export type TxtResolver = (name: string) => Promise<string[][]>;

/** Per-query timeout of the default resolver (ms) and its attempts. */
const RESOLVER_TIMEOUT_MS = 2_500;
const RESOLVER_TRIES = 2;
/** Upper bound for the whole lookup, whatever the resolver does. */
const LOOKUP_DEADLINE_MS = 8_000;

/** Errors meaning the name has no TXT records, as opposed to no answer. */
const NO_RECORDS_CODES: ReadonlySet<string> = new Set(["ENODATA", "ENOTFOUND"]);

function defaultTxtResolver(name: string): Promise<string[][]> {
  const resolver = new Resolver({ timeout: RESOLVER_TIMEOUT_MS, tries: RESOLVER_TRIES });
  return resolver.resolveTxt(name);
}

function errorCode(e: unknown): string {
  if (e && typeof e === "object" && "code" in e && typeof e.code === "string") {
    return e.code;
  }
  return "UNKNOWN";
}

/**
 * @description Looks up the TXT records of `name`. Names under the
 * special-use `.invalid` TLD never exist (RFC 6761 §6.4) and are answered
 * without a query.
 *
 * @param resolve The resolver to query; the system's DNS servers by default
 * (tests inject their own).
 */
export async function lookupTxtRecords(
  name: string,
  resolve: TxtResolver = defaultTxtResolver,
): Promise<TxtLookupResult> {
  const normalized: string = name.toLowerCase().replace(/\.$/, "");
  if (normalized === "invalid" || normalized.endsWith(".invalid")) {
    return { kind: "no_records" };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error("TXT lookup timed out"), { code: "ETIMEOUT" })),
      LOOKUP_DEADLINE_MS,
    );
  });
  try {
    const answer: string[][] = await Promise.race([resolve(normalized), deadline]);
    const records: string[] = answer.map((chunks) => chunks.join(""));
    return records.length === 0 ? { kind: "no_records" } : { kind: "records", records };
  } catch (e: unknown) {
    const code: string = errorCode(e);
    if (NO_RECORDS_CODES.has(code)) {
      return { kind: "no_records" };
    }
    return { kind: "lookup_failed", code };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export default lookupTxtRecords;
