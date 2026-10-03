import { createHash } from "node:crypto";

/**
 * The message with the parts that vary between occurrences of the same
 * error (ids, numbers, quoted values) replaced by placeholders, so that
 * "User 'a1b2…' not found (attempt 3)" and "User 'c3d4…' not found
 * (attempt 7)" land in one group.
 */
export function normalizeClientErrorMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hex>")
    .replace(/https?:\/\/[^\s'"`)]+/gi, "<url>")
    .replace(/(['"`])(?:(?!\1).){1,200}\1/g, "<str>")
    .replace(/\d+(?:\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ClientErrorFingerprintInput {
  name: string;
  message: string;
  operation?: string | null;
}

/**
 * Groups reports of the same error: a hash of the error name, the
 * normalized message and the operation the client was performing. The
 * client app is deliberately left out so the stats can show how many apps
 * one error affects.
 */
export function computeClientErrorFingerprint({
  name,
  message,
  operation,
}: ClientErrorFingerprintInput): string {
  return createHash("sha256")
    .update(`${name}\n${normalizeClientErrorMessage(message)}\n${operation ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * The page URL a report carries, reduced to origin + path: query strings
 * and fragments of auth callbacks carry authorization codes, `state` and
 * tokens, so they are never stored. Returns null for anything that is not
 * an absolute http(s) URL.
 */
export function sanitizeReportedPageUrl(page_url: string | undefined): string | null {
  if (!page_url) return null;
  let url: URL;
  try {
    url = new URL(page_url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return `${url.origin}${url.pathname}`;
}

/** Fingerprints are 32 lowercase hex characters. */
export const CLIENT_ERROR_FINGERPRINT_REGEX: RegExp = /^[0-9a-f]{32}$/;
