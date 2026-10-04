import type { ClientErrorReport } from "./client-error-report";

/**
 * Redaction of credentials in client error reports. Error messages, stack
 * traces and app-supplied context can carry tokens (a token response that
 * fails validation ends up in the error's `cause`), authorization codes,
 * passwords or cookies. The client SDK redacts its reports before sending
 * them, and the auth server redacts every report again before storing it,
 * since older SDKs and other clients do not. Over-redaction is accepted: a
 * report only has to say what went wrong.
 *
 * The patterns run in linear time (the server applies them to unauthenticated
 * input) and use no lookbehind (older Safari cannot parse it). Isomorphic.
 */

/** What a redacted value is replaced with. */
export const CLIENT_ERROR_REDACTED: string = "[redacted]";

/** A key containing one of these (lowercased, `-` read as `_`) holds a secret. */
const SECRET_KEY_FRAGMENTS: readonly string[] = [
  "token",
  "secret",
  "password",
  "passwd",
  "authorization",
  "cookie",
  "credential",
  "api_key",
  "apikey",
  "private_key",
  "privatekey",
  "code_verifier",
  "session_id",
  "sessionid",
];

/** Keys that hold a secret when they are the whole (last dotted segment of the) key. */
const SECRET_KEY_NAMES: ReadonlySet<string> = new Set(["auth", "pass", "pwd", "jwt", "otp", "totp", "nonce"]);

/**
 * Query / form parameters that hold a secret: `code` is the authorization
 * code in a callback URL, but too common a key elsewhere (`code: 500`,
 * `{ code: "ERR_NETWORK" }`) to redact outside `name=value` pairs.
 */
const SECRET_PARAM_NAMES: ReadonlySet<string> = new Set(["code"]);

/** Context deeper than this is not inspected, so it is not kept. */
const MAX_CONTEXT_DEPTH: number = 32;

/** Whether a key (an object member, query parameter or header name) holds a secret. */
export function isClientErrorSecretKey(key: string): boolean {
  const normalized: string = key.toLowerCase().replace(/-/g, "_");
  const last: string = normalized.slice(normalized.lastIndexOf(".") + 1);
  return SECRET_KEY_NAMES.has(last) || SECRET_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/**
 * JWS (3 segments) and JWE (5 segments) compact serializations, which start
 * with a base64url `{"` header. The dot is checked in the replacer rather
 * than the pattern, which would otherwise backtrack over long runs.
 */
const JWT_CANDIDATE_REGEX: RegExp = /eyJ[A-Za-z0-9_.-]{4,}/g;

/** The credentials of an `Authorization` header value. */
const AUTH_SCHEME_REGEX: RegExp = /\b(Bearer|DPoP|Basic)([ \t]+)[A-Za-z0-9._~+/-]{8,}=*/gi;

/**
 * The key and separator of `key=value`, `key: value` and `"key": value`
 * (also with JSON-escaped quotes, as in a stringified body inside a
 * message). Only the key is matched here: a non-secret value (`https:` in
 * a URL, say) must not swallow the `?code=` that follows it. Bounded key
 * and whitespace lengths keep it linear.
 */
const KEY_SEPARATOR_REGEX: RegExp = /([A-Za-z_][A-Za-z0-9_.-]{0,63})(\\?["']?[ \t]{0,8}([:=])[ \t]{0,8})/g;

/**
 * The value after a secret key's separator: a quoted string (also
 * unterminated, as when truncation cut it short) or an unquoted run,
 * optionally after an `Authorization` scheme. Sticky: it is matched where
 * the separator ends.
 */
const SECRET_VALUE_REGEX: RegExp =
  /\\?"(?:[^"\\]|\\[^"])*(?:\\?")?|'[^'\n]*'?|(?:(?:Bearer|DPoP|Basic)[ \t]+)?[^\s"'\\&,;{}()[\]<>]+/iy;

/** Source file names in stack frames (`exchange-auth-tokens.js:216:13`) are not keys. */
const SOURCE_FILE_KEY_REGEX: RegExp = /\.(?:[cm]?[jt]sx?|map|html?|vue|svelte)$/i;

/** `value` with its content replaced, keeping its quotes. */
function redactedValue(value: string): string {
  const open: string = /^\\?["']/.exec(value)?.[0] ?? "";
  if (!open) return CLIENT_ERROR_REDACTED;
  const close: string = value.length > open.length && value.endsWith(open) ? open : "";
  return `${open}${CLIENT_ERROR_REDACTED}${close}`;
}

function isSecretKeyBeforeOperator(key: string, operator: string): boolean {
  if (SOURCE_FILE_KEY_REGEX.test(key)) return false;
  return isClientErrorSecretKey(key) || (operator === "=" && SECRET_PARAM_NAMES.has(key.toLowerCase()));
}

/** `text` with the values of secret keys replaced. */
function redactKeyValues(text: string): string {
  let redacted: string = "";
  let copied: number = 0;
  KEY_SEPARATOR_REGEX.lastIndex = 0;
  for (let match = KEY_SEPARATOR_REGEX.exec(text); match !== null; match = KEY_SEPARATOR_REGEX.exec(text)) {
    const [keyAndSeparator, key = "", , operator = ""] = match;
    if (!isSecretKeyBeforeOperator(key, operator)) continue;
    const valueStart: number = match.index + keyAndSeparator.length;
    SECRET_VALUE_REGEX.lastIndex = valueStart;
    const value: string | undefined = SECRET_VALUE_REGEX.exec(text)?.[0];
    if (!value) continue;
    redacted += text.slice(copied, valueStart) + redactedValue(value);
    copied = valueStart + value.length;
    KEY_SEPARATOR_REGEX.lastIndex = copied;
  }
  return redacted + text.slice(copied);
}

/** `text` with tokens, `Authorization` credentials and the values of secret keys replaced. */
export function redactClientErrorText(text: string): string {
  return redactKeyValues(
    text
      .replace(JWT_CANDIDATE_REGEX, (candidate: string): string =>
        candidate.includes(".") ? CLIENT_ERROR_REDACTED : candidate,
      )
      .replace(AUTH_SCHEME_REGEX, `$1$2${CLIENT_ERROR_REDACTED}`),
  );
}

function redactJsonValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactClientErrorText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_CONTEXT_DEPTH) return CLIENT_ERROR_REDACTED;
  if (Array.isArray(value)) return value.map((item: unknown): unknown => redactJsonValue(item, depth + 1));
  // Object.fromEntries defines own properties: a `__proto__` member stays data.
  return Object.fromEntries(
    Object.entries(value).map(([key, member]: [string, unknown]): [string, unknown] => [
      key,
      isClientErrorSecretKey(key) ? CLIENT_ERROR_REDACTED : redactJsonValue(member, depth + 1),
    ]),
  );
}

/**
 * A report's JSON `context` with the members under secret keys replaced and
 * every string redacted like {@link redactClientErrorText}. Members nested
 * deeper than {@link MAX_CONTEXT_DEPTH} are replaced too.
 */
export function redactClientErrorContext(context: Record<string, unknown>): Record<string, unknown> {
  return redactJsonValue(context, 0) as Record<string, unknown>;
}

/** `report` with its message, stack and context redacted. */
export function redactClientErrorReport(report: ClientErrorReport): ClientErrorReport {
  return {
    ...report,
    message: redactClientErrorText(report.message),
    ...(report.stack !== undefined ? { stack: redactClientErrorText(report.stack) } : {}),
    ...(report.context !== undefined ? { context: redactClientErrorContext(report.context) } : {}),
  };
}
