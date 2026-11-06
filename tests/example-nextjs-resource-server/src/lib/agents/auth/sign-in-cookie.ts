import "server-only";
import { agentsClientCredentials, AGENTS_COOKIE_PATH } from "./agents-client";
import {
  clearChunkedCookie,
  readChunkedCookie,
  sealValue,
  unsealValue,
  writeChunkedCookie,
  type CookieJar,
  type CookieOptions,
  type CookieReader,
} from "./sealed-cookie";

/**
 * A sign-in to the agents app: the user's tokens for the example API. The
 * browser holds it in sealed cookies (scoped to /agents) and the server opens
 * it on each request, so no server instance has to remember anyone: what
 * makes the app work on serverless hosts. The access token is what agent
 * sessions' delegated tokens are exchanged from; the refresh token renews it
 * and, revoked at sign-out, ends every token of this sign-in, agents' included.
 */
export interface AgentsSignIn {
  /** OIDC subject `<auth_server_app_id>|<uid>`. */
  sub: string;
  email: string | null;
  /** The scope the user granted the app (see AGENTS_SIGN_IN_SCOPE). */
  scope: string;
  access_token: string;
  /** Unix milliseconds. */
  access_token_expires_at: number;
  refresh_token: string | null;
}

const SIGN_IN_COOKIE = "example_agents_sign_in";
const SEAL_PURPOSE = "agents sign-in";
const SIGN_IN_MAX_AGE = 60 * 60 * 8;

function cookieOptions(secure: boolean, maxAge: number): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure, path: AGENTS_COOKIE_PATH, maxAge };
}

/** The key the sign-in is sealed with derives from the app's client secret: rotating it signs everyone out. */
function sealingSecret(): string {
  return agentsClientCredentials().client_secret;
}

function isAgentsSignIn(value: unknown): value is AgentsSignIn {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sub === "string" &&
    (typeof v.email === "string" || v.email === null) &&
    typeof v.scope === "string" &&
    typeof v.access_token === "string" &&
    typeof v.access_token_expires_at === "number" &&
    (typeof v.refresh_token === "string" || v.refresh_token === null)
  );
}

/** The sign-in in the request's cookies, or null when there is none (or it does not open). */
export async function readAgentsSignIn(jar: CookieReader): Promise<AgentsSignIn | null> {
  const sealed = readChunkedCookie(jar, SIGN_IN_COOKIE);
  if (!sealed) return null;
  const value = await unsealValue(sealingSecret(), SEAL_PURPOSE, sealed);
  return isAgentsSignIn(value) ? value : null;
}

/** Seals `signIn` into the response's cookies (`previous`: the request's, to expire stale chunks). */
export async function writeAgentsSignIn(
  jar: CookieJar,
  signIn: AgentsSignIn,
  secure: boolean,
  previous?: CookieReader,
): Promise<void> {
  const sealed = await sealValue(sealingSecret(), SEAL_PURPOSE, signIn);
  writeChunkedCookie(jar, SIGN_IN_COOKIE, sealed, cookieOptions(secure, SIGN_IN_MAX_AGE), previous);
}

export function clearAgentsSignIn(jar: CookieJar, secure: boolean): void {
  clearChunkedCookie(jar, SIGN_IN_COOKIE, cookieOptions(secure, 0));
}
