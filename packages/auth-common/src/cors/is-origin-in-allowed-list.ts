/**
 * Check if an origin is in a list of allowed origins.
 *
 * Matching is exact, but tolerant of a single trailing slash on either the
 * request origin or the allowed origin (e.g. "https://app.example.com" and
 * "https://app.example.com/" match each other).
 */
export function isOriginInAllowedList(
  origin: string,
  allowedOrigins: readonly string[],
): boolean {
  return allowedOrigins.some((allowed) => {
    // Direct match
    if (origin === allowed) return true;
    // Origin may or may not have trailing slash
    if (origin === allowed.replace(/\/$/, "")) return true;
    if (origin.replace(/\/$/, "") === allowed) return true;
    return false;
  });
}

export default isOriginInAllowedList;
