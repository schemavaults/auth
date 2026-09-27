// Builds the URL of the "verify your email to continue" interstitial
// (`/auth/verify-email/required`) from the parameters of an in-flight
// third-party authorize flow, and the URL that resumes that flow.
//
// NOT server-only: the login form, the MFA challenge page and the consent
// screen build it client-side from `useSearchParams()`; the server pages
// build it from their `searchParams` / props.

export const VERIFY_EMAIL_REQUIRED_PATH = "/auth/verify-email/required" as const;

/**
 * The authorize-flow parameters the interstitial carries so it can send the
 * user back into `/auth/login?…` once the address is verified (the login page
 * then completes the hand-off from its already-signed-in branch, consent
 * screen included). Everything else on the entry URL is dropped.
 */
export const AUTHORIZE_FLOW_PARAM_KEYS = [
  "app_id",
  "code_challenge",
  "code_challenge_method",
  "challenge_time",
  "redirect_uri",
  "state",
  "nonce",
  "scope",
] as const;

export type AuthorizeFlowParamKey = (typeof AUTHORIZE_FLOW_PARAM_KEYS)[number];

export type AuthorizeFlowParams = Partial<
  Record<AuthorizeFlowParamKey, string | null | undefined>
>;

type ParamSource =
  | URLSearchParams
  | AuthorizeFlowParams
  | { [key: string]: string | string[] | undefined };

function readParam(source: ParamSource, key: AuthorizeFlowParamKey): string | null {
  if (source instanceof URLSearchParams) {
    const value = source.get(key);
    return value && value.length > 0 ? value : null;
  }
  const value: unknown = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * @name pickAuthorizeFlowParams
 * @description Copies the known authorize-flow parameters out of a search
 * params object / record, ignoring everything else.
 */
export function pickAuthorizeFlowParams(source: ParamSource): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of AUTHORIZE_FLOW_PARAM_KEYS) {
    const value = readParam(source, key);
    if (value !== null) {
      params.set(key, value);
    }
  }
  return params;
}

/**
 * @name buildVerifyEmailRequiredHref
 * @description Same-origin path of the interstitial that parks an unverified
 * user before a third-party hand-off, carrying the flow parameters needed to
 * resume it.
 */
export function buildVerifyEmailRequiredHref(source: ParamSource): string {
  const params = pickAuthorizeFlowParams(source);
  const query = params.toString();
  return query.length > 0
    ? `${VERIFY_EMAIL_REQUIRED_PATH}?${query}`
    : VERIFY_EMAIL_REQUIRED_PATH;
}

/**
 * @name buildResumeAuthorizeFlowHref
 * @description Same-origin path that resumes the parked flow: the login page
 * with the original parameters. With the auth server session cookie present,
 * the page's already-signed-in branch re-checks the gate and, once the
 * address is verified, mints the code (asking for consent first when needed)
 * and redirects to the app.
 */
export function buildResumeAuthorizeFlowHref(source: ParamSource): string {
  const params = pickAuthorizeFlowParams(source);
  const query = params.toString();
  return query.length > 0 ? `/auth/login?${query}` : "/auth/login";
}
