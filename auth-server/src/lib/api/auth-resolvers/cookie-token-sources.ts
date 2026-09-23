import "server-only";
import {
  AccessTokenCookieName,
  accessTokenDataSchema,
  RefreshTokenCookieName,
  type PotentiallyValidTokenSource,
} from "@schemavaults/auth-common";
import { getCookie, type HonoContext } from "@schemavaults/openapi-operations";
import getStringByteSize from "@schemavaults/auth-server-sdk/getStringByteSize";
import MaximumBrowserCookieSize from "@/lib/MaximumBrowserCookieSize";

/**
 * Cookie values shorter than a JWT can be, or larger than a browser would
 * ever send, are ignored rather than verified (same bounds as the retired
 * route guard wrapper).
 */
function plausibleTokenCookie(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    value.length > 64 &&
    getStringByteSize(value) <= MaximumBrowserCookieSize
  );
}

/** The refresh token cookie of `app_id` (auth server session or client app session). */
export function refreshTokenCookieSource(
  c: HonoContext,
  app_id: string,
  sourceHint: string,
): PotentiallyValidTokenSource | null {
  const value = getCookie(c, RefreshTokenCookieName(app_id));
  if (!plausibleTokenCookie(value)) return null;
  return { sourceHint, type: "refresh", token: value };
}

/**
 * The access token cookie of `app_id`. The client SDK stores a JSON
 * `{ token, exp }` blob (skipped once expired); a raw JWT string is
 * accepted as a fallback.
 */
export function accessTokenCookieSource(
  c: HonoContext,
  app_id: string,
): PotentiallyValidTokenSource | null {
  const cookieName = AccessTokenCookieName(app_id);
  const value = getCookie(c, cookieName);
  if (!plausibleTokenCookie(value)) return null;
  let jwt: string | null = null;
  try {
    const parsed = accessTokenDataSchema.safeParse(JSON.parse(value));
    if (!parsed.success) throw parsed.error;
    if (Date.now() < parsed.data.exp) jwt = parsed.data.token;
  } catch {
    jwt = value;
  }
  if (!jwt) return null;
  return {
    sourceHint: `Access Token from cookie '${cookieName}'`,
    type: "access",
    token: jwt,
  };
}

/** `Authorization: Bearer <access token>`; null when absent or not a bearer credential. */
export function bearerAccessTokenSource(c: HonoContext): PotentiallyValidTokenSource | null {
  const header = c.req.header("authorization");
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (token.length === 0) return null;
  return { sourceHint: "Access Token from Authorization Bearer header", type: "access", token };
}
