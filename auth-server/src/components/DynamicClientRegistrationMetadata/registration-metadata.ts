import type { DynamicClientRegistrationMetadataFields } from "@schemavaults/app-definitions";

/**
 * Display model of the RFC 7591 metadata a dynamically registered client
 * supplied at `POST /api/oidc/register`, for the app detail page.
 *
 * Every value here was chosen by an anonymous client, so it is shaped for
 * safe display rather than trusted:
 * - URIs become links only when they are plain `http(s)` URLs without
 *   embedded credentials (`https://trusted.example@evil.example/` reads as
 *   the wrong host), and are shown in their parsed form, whose host is
 *   punycode-encoded so look-alike internationalized domains are visible.
 * - Free text has control and bidirectional-formatting characters replaced
 *   with U+FFFD, so a value cannot reorder or hide what is displayed.
 * - The logo is described, never fetched (see the card).
 */

/** The URI-valued RFC 7591 metadata members, in display order. */
export const DYNAMIC_CLIENT_METADATA_URI_FIELDS = [
  "client_uri",
  "logo_uri",
  "tos_uri",
  "policy_uri",
] as const satisfies readonly (keyof DynamicClientRegistrationMetadataFields)[];

export type DynamicClientMetadataUriField =
  (typeof DYNAMIC_CLIENT_METADATA_URI_FIELDS)[number];

export const DYNAMIC_CLIENT_METADATA_URI_LABELS: Record<
  DynamicClientMetadataUriField,
  string
> = {
  client_uri: "Home page",
  logo_uri: "Logo",
  tos_uri: "Terms of service",
  policy_uri: "Privacy policy",
};

/** Why a supplied URI is shown as text instead of a link. */
export type UnsafeUriReason = "unparseable" | "scheme" | "credentials";

export type SafeExternalLink =
  | { safe: true; href: string }
  | { safe: false; text: string; reason: UnsafeUriReason };

export interface DynamicClientMetadataLink {
  field: DynamicClientMetadataUriField;
  label: string;
  /** null when the client did not supply this URI. */
  link: SafeExternalLink | null;
}

export interface DynamicClientRegistrationMetadataSummary {
  links: readonly DynamicClientMetadataLink[];
  contacts: readonly string[];
  token_endpoint_auth_method: string | null;
  grant_types: readonly string[];
  response_types: readonly string[];
  /** The registration's `scope`, split into its scope tokens. */
  requested_scopes: readonly string[];
  software_id: string | null;
  software_version: string | null;
  /** `client_id_issued_at` converted to milliseconds, or null. */
  client_id_issued_at_ms: number | null;
}

/**
 * C0/C1 controls (`\p{Cc}`) and the Unicode bidirectional formatting characters
 * (LRM/RLM/ALM, the LRE...RLO embeddings and overrides, the LRI...PDI
 * isolates), which could make displayed text read differently from what
 * it is.
 */
const UNSAFE_DISPLAY_CHARACTERS =
  /[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

/**
 * @description Replaces control and bidirectional-formatting characters
 * of client-supplied text with U+FFFD (visibly, rather than silently
 * dropping them).
 */
export function sanitizeDisplayText(value: string): string {
  return value.replace(UNSAFE_DISPLAY_CHARACTERS, "\uFFFD");
}

/**
 * @description Decides whether a client-supplied URI may be rendered as a
 * link: only `http:` / `https:` URLs without a username or password are.
 * Safe links carry the parsed (normalised, punycode-host) href.
 */
export function toSafeExternalLink(uri: string): SafeExternalLink {
  const text: string = sanitizeDisplayText(uri);
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return { safe: false, text, reason: "unparseable" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { safe: false, text, reason: "scheme" };
  }
  if (url.username !== "" || url.password !== "") {
    return { safe: false, text, reason: "credentials" };
  }
  return { safe: true, href: url.href };
}

function nonEmptyText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed: string = value.trim();
  return trimmed.length > 0 ? sanitizeDisplayText(trimmed) : null;
}

function textList(values: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const out: string[] = [];
  for (const value of values) {
    const text: string | null = nonEmptyText(value);
    if (text !== null && !out.includes(text)) {
      out.push(text);
    }
  }
  return out;
}

/**
 * @description Builds the display model of a dynamically registered
 * client's stored RFC 7591 metadata (absent members become null / empty).
 */
export function summarizeDynamicClientRegistrationMetadata(
  app: DynamicClientRegistrationMetadataFields,
): DynamicClientRegistrationMetadataSummary {
  const links: DynamicClientMetadataLink[] =
    DYNAMIC_CLIENT_METADATA_URI_FIELDS.map((field) => {
      const uri: string = (app[field] ?? "").trim();
      return {
        field,
        label: DYNAMIC_CLIENT_METADATA_URI_LABELS[field],
        link: uri.length > 0 ? toSafeExternalLink(uri) : null,
      };
    });

  const issued_at: number | null | undefined = app.client_id_issued_at;

  return {
    links,
    contacts: textList(app.contacts),
    token_endpoint_auth_method: nonEmptyText(app.token_endpoint_auth_method),
    grant_types: textList(app.grant_types),
    response_types: textList(app.response_types),
    requested_scopes: textList(
      typeof app.registered_scope === "string"
        ? app.registered_scope.split(/\s+/)
        : [],
    ),
    software_id: nonEmptyText(app.software_id),
    software_version: nonEmptyText(app.software_version),
    client_id_issued_at_ms:
      typeof issued_at === "number" && Number.isFinite(issued_at)
        ? issued_at * 1000
        : null,
  };
}
