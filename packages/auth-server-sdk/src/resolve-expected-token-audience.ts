/**
 * Reads the unverified JOSE header of a compact-serialized token. Kept
 * dependency-free (no `jose` import) since only the `aud` member is
 * needed and the cryptographic verification happens afterwards.
 */
function decodeUnverifiedJoseHeader(token: string): Record<string, unknown> | null {
  const first_segment: string | undefined = token.split(".")[0];
  if (!first_segment) {
    return null;
  }
  try {
    const json: string = Buffer.from(first_segment, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * @description Picks the `aud` value a token must carry to be accepted by
 * this resource server.
 *
 * Tokens are normally minted with the API server's stable token audience
 * (its id, or the auth server URL for the auth server itself). A client
 * that requested the token with an RFC 8707 `resource` URL — MCP clients
 * do — receives a token whose `aud` is that URL instead, signed with the
 * same API server keyset. A resource server that wants to accept such
 * tokens lists the URL(s) it is known by in `accepted_audiences`; when a
 * presented token's header names one of them, that value is enforced as
 * the expected audience, otherwise the default applies (and a token with
 * any other `aud` fails the audience check as before).
 *
 * Only the unverified JOSE header is read here; the audience is enforced
 * by the cryptographic decode that follows, so a forged header buys an
 * attacker nothing.
 */
export function resolveExpectedTokenAudience(
  token: string,
  default_audience: string,
  accepted_audiences: readonly string[] | undefined,
): string {
  if (!accepted_audiences || accepted_audiences.length === 0) {
    return default_audience;
  }
  const header_aud: unknown = decodeUnverifiedJoseHeader(token)?.aud;
  if (typeof header_aud === "string" && accepted_audiences.includes(header_aud)) {
    return header_aud;
  }
  return default_audience;
}

/**
 * @description Validates a resource server's `accepted_audiences`
 * configuration: absolute http(s) URLs without fragments, deduplicated.
 */
export function normalizeAcceptedAudiences(
  accepted_audiences: readonly string[] | undefined,
): readonly string[] {
  if (accepted_audiences === undefined) {
    return [];
  }
  if (!Array.isArray(accepted_audiences)) {
    throw new TypeError("'accepted_audiences' must be an array of URLs");
  }
  const normalized = new Set<string>();
  for (const value of accepted_audiences) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError("'accepted_audiences' entries must be non-empty strings");
    }
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new TypeError(`'accepted_audiences' entry is not an absolute URL: ${value}`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new TypeError(`'accepted_audiences' entry must be an http(s) URL: ${value}`);
    }
    if (value.includes("#")) {
      throw new TypeError(`'accepted_audiences' entry must not include a fragment: ${value}`);
    }
    normalized.add(value);
  }
  return [...normalized];
}
