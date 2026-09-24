/**
 * Lenient cookie lookup on the raw `Cookie` header.
 *
 * Hono's `getCookie()` follows RFC 6265 strictly and drops any cookie whose
 * value contains a double quote, comma, semicolon or backslash. The retired
 * route guard read cookies through Next.js, whose parser accepts such
 * values (e.g. an access-token cookie set as raw JSON instead of the
 * URL-encoded form the client SDK writes), so the token cookies keep being
 * read leniently: first `name=` match wins, the value is URL-decoded when it
 * decodes, and returned verbatim otherwise.
 */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | undefined {
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}
