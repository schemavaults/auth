/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591) wire contract and
 * request parsing, shared by the auth server's `POST /api/oidc/register`
 * endpoint and `@schemavaults/auth-client-sdk`'s `registerDynamicClient()`
 * helper.
 *
 * The parser here is pure: it validates and normalizes a registration
 * request body against the platform's capabilities (authorization code
 * flow with PKCE, optional client secret, redirect URI policy) and reports
 * the RFC 7591 §3.2.2 error codes. Persisting the client, generating its
 * id/secret and enforcing the deployment's settings is the server's job.
 */

import { z } from "zod";
import {
  APP_CALLBACK_URL_MAX_LENGTH,
  APP_NAME_MAX_LENGTH,
  DYNAMIC_CLIENT_CONTACT_MAX_LENGTH,
  DYNAMIC_CLIENT_GRANT_TYPES,
  DYNAMIC_CLIENT_MAX_CONTACTS,
  DYNAMIC_CLIENT_METADATA_URI_MAX_LENGTH,
  DYNAMIC_CLIENT_RESPONSE_TYPES,
  DYNAMIC_CLIENT_SCOPE_MAX_LENGTH,
  DYNAMIC_CLIENT_SOFTWARE_FIELD_MAX_LENGTH,
  DYNAMIC_CLIENT_TOKEN_ENDPOINT_AUTH_METHODS,
  dynamicClientGrantTypeSchema,
  dynamicClientResponseTypeSchema,
  dynamicClientTokenEndpointAuthMethodSchema,
  type DynamicClientGrantType,
  type DynamicClientResponseType,
  type DynamicClientTokenEndpointAuthMethod,
} from "@schemavaults/app-definitions";
import { OIDC_SCOPE_REGEX } from "./scope";

/** RFC 7591 §3.2.2 error codes the registration endpoint emits. */
export const DYNAMIC_CLIENT_REGISTRATION_ERRORS = [
  "invalid_redirect_uri",
  "invalid_client_metadata",
] as const satisfies readonly string[];

export type DynamicClientRegistrationErrorCode =
  (typeof DYNAMIC_CLIENT_REGISTRATION_ERRORS)[number];

export const dynamicClientRegistrationErrorSchema = z.object({
  error: z.enum(DYNAMIC_CLIENT_REGISTRATION_ERRORS),
  error_description: z.string().optional(),
});

export type DynamicClientRegistrationError = {
  error: DynamicClientRegistrationErrorCode;
  error_description: string;
};

/** Mirrors the per-app callback URL cap enforced by the auth server. */
export const DYNAMIC_CLIENT_MAX_REDIRECT_URIS = 50 as const;

/**
 * Metadata fields (RFC 7591 §2) the platform cannot honour. A request
 * carrying any of them is rejected with `invalid_client_metadata` rather
 * than silently registering a client that will not behave as it asked:
 * asymmetric client authentication (`jwks`, `jwks_uri`) is not
 * implemented at the token endpoint, and software statements
 * (`software_statement`) have no trusted issuers.
 */
export const DYNAMIC_CLIENT_UNSUPPORTED_METADATA_FIELDS = [
  "jwks",
  "jwks_uri",
  "software_statement",
] as const satisfies readonly string[];

/**
 * The RFC 7591 §2 request body as the endpoint accepts it. Unknown
 * members are ignored per §2 ("the authorization server MUST ignore any
 * client metadata sent by the client that it does not understand").
 */
export type DynamicClientRegistrationRequest = {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: DynamicClientTokenEndpointAuthMethod;
  grant_types?: DynamicClientGrantType[];
  response_types?: DynamicClientResponseType[];
  client_uri?: string;
  logo_uri?: string;
  tos_uri?: string;
  policy_uri?: string;
  contacts?: string[];
  scope?: string;
  software_id?: string;
  software_version?: string;
};

/**
 * The normalized metadata a valid request resolves to: every optional
 * member defaulted per RFC 7591 §2, `client_name` always present.
 */
export interface ParsedDynamicClientMetadata {
  redirect_uris: readonly string[];
  client_name: string;
  token_endpoint_auth_method: DynamicClientTokenEndpointAuthMethod;
  grant_types: readonly DynamicClientGrantType[];
  response_types: readonly DynamicClientResponseType[];
  client_uri: string | null;
  logo_uri: string | null;
  tos_uri: string | null;
  policy_uri: string | null;
  contacts: readonly string[] | null;
  scope: string | null;
  software_id: string | null;
  software_version: string | null;
}

/**
 * RFC 7591 §3.2.1 registration response: the issued client identifier
 * (and secret, for confidential clients) plus every registered metadata
 * value as the server understood it. `client_secret_expires_at` is `0`
 * because issued secrets do not expire.
 */
export const dynamicClientRegistrationResponseSchema = z
  .object({
    client_id: z.string().min(1),
    client_secret: z.string().min(1).optional(),
    client_id_issued_at: z.number().int().nonnegative(),
    client_secret_expires_at: z.number().int().nonnegative().optional(),
    redirect_uris: z.array(z.string()).min(1),
    client_name: z.string(),
    token_endpoint_auth_method: dynamicClientTokenEndpointAuthMethodSchema,
    grant_types: z.array(dynamicClientGrantTypeSchema),
    response_types: z.array(dynamicClientResponseTypeSchema),
    client_uri: z.string().optional(),
    logo_uri: z.string().optional(),
    tos_uri: z.string().optional(),
    policy_uri: z.string().optional(),
    contacts: z.array(z.string()).optional(),
    scope: z.string().optional(),
    software_id: z.string().optional(),
    software_version: z.string().optional(),
  })
  .loose();

export type DynamicClientRegistrationResponse = z.infer<
  typeof dynamicClientRegistrationResponseSchema
>;

export interface ParseDynamicClientRegistrationRequestOptions {
  /**
   * Whether `http://localhost[:port]/...` redirect URIs are accepted. RFC
   * 8252 §7.3 only sanctions the loopback IP literals, but many native and
   * MCP clients still use the `localhost` name. Unlike the IP literals, a
   * registered `localhost` URI matches its port exactly.
   */
  allow_localhost_redirect_uris: boolean;
  /**
   * Whether private-use URI scheme redirect URIs (`com.example.app:/cb`,
   * `vscode://...`) are accepted (RFC 8252 §7.1).
   */
  allow_custom_scheme_redirect_uris: boolean;
}

export type ParseDynamicClientRegistrationRequestResult =
  | { ok: true; metadata: ParsedDynamicClientMetadata }
  | { ok: false; error: DynamicClientRegistrationError };

/**
 * How a redirect URI is classified by the registration policy.
 */
export type DynamicClientRedirectUriKind =
  | "https"
  | "http-loopback"
  | "http-localhost"
  | "http-other"
  | "custom-scheme"
  | "forbidden-scheme"
  | "invalid";

/**
 * Schemes that are never acceptable as a redirect target, whatever the
 * deployment's policy: they either execute in the browser or are not
 * application-controlled.
 */
const FORBIDDEN_REDIRECT_SCHEMES: ReadonlySet<string> = new Set([
  "javascript",
  "data",
  "blob",
  "file",
  "about",
  "ftp",
  "ws",
  "wss",
  "mailto",
]);

function isLoopbackHostname(hostname: string): boolean {
  // URL.hostname keeps the brackets on IPv6 literals.
  return hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * @description Classifies a candidate redirect URI (RFC 6749 §3.1.2 /
 * RFC 8252 §7) without applying any deployment policy.
 */
export function classifyDynamicClientRedirectUri(
  value: unknown,
): DynamicClientRedirectUriKind {
  if (typeof value !== "string" || value.length === 0) {
    return "invalid";
  }
  if (value.length > APP_CALLBACK_URL_MAX_LENGTH) {
    return "invalid";
  }
  // RFC 6749 §3.1.2: the redirection endpoint URI MUST NOT include a
  // fragment component.
  if (value.includes("#")) {
    return "invalid";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "invalid";
  }
  const scheme: string = url.protocol.replace(/:$/, "").toLowerCase();
  if (scheme === "https") {
    return "https";
  }
  if (scheme === "http") {
    if (isLoopbackHostname(url.hostname)) {
      return "http-loopback";
    }
    if (url.hostname === "localhost") {
      return "http-localhost";
    }
    return "http-other";
  }
  if (FORBIDDEN_REDIRECT_SCHEMES.has(scheme)) {
    return "forbidden-scheme";
  }
  return "custom-scheme";
}

/**
 * @description Display name for a client that registered without a
 * `client_name`: the host of its first redirect URI, or the URI's scheme
 * for private-use schemes without a host.
 */
export function deriveDynamicClientNameFromRedirectUri(
  redirect_uri: string,
): string {
  try {
    const url = new URL(redirect_uri);
    const host: string = url.host;
    if (host.length > 0) {
      return host.slice(0, APP_NAME_MAX_LENGTH);
    }
    const scheme: string = url.protocol.replace(/:$/, "");
    return (scheme.length > 0 ? scheme : "Dynamically registered client").slice(
      0,
      APP_NAME_MAX_LENGTH,
    );
  } catch {
    return "Dynamically registered client";
  }
}

const optionalMetadataUriSchema = z
  .url({ protocol: /^https?$/ })
  .max(DYNAMIC_CLIENT_METADATA_URI_MAX_LENGTH);

const optionalSoftwareFieldSchema = z
  .string()
  .max(DYNAMIC_CLIENT_SOFTWARE_FIELD_MAX_LENGTH);

/**
 * Loose structural schema for the request body: only the members the
 * platform reads, each validated for type/bounds; everything else is
 * dropped. Semantic policy (allowed values, redirect URI classes) is
 * applied afterwards so that every failure maps onto the right RFC 7591
 * error code with a useful description.
 */
const requestBodyShapeSchema = z
  .object({
    redirect_uris: z.array(z.string()).optional(),
    client_name: z.string().optional(),
    token_endpoint_auth_method: z.string().optional(),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
    client_uri: optionalMetadataUriSchema.optional(),
    logo_uri: optionalMetadataUriSchema.optional(),
    tos_uri: optionalMetadataUriSchema.optional(),
    policy_uri: optionalMetadataUriSchema.optional(),
    contacts: z
      .array(z.string().min(1).max(DYNAMIC_CLIENT_CONTACT_MAX_LENGTH))
      .max(DYNAMIC_CLIENT_MAX_CONTACTS)
      .optional(),
    scope: z.string().max(DYNAMIC_CLIENT_SCOPE_MAX_LENGTH).optional(),
    software_id: optionalSoftwareFieldSchema.optional(),
    software_version: optionalSoftwareFieldSchema.optional(),
  })
  .loose();

function metadataError(
  error_description: string,
): ParseDynamicClientRegistrationRequestResult {
  return {
    ok: false,
    error: { error: "invalid_client_metadata", error_description },
  };
}

function redirectUriError(
  error_description: string,
): ParseDynamicClientRegistrationRequestResult {
  return {
    ok: false,
    error: { error: "invalid_redirect_uri", error_description },
  };
}

function describeFirstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "Malformed client metadata.";
  }
  const path: string = issue.path.map((p) => String(p)).join(".");
  return path.length > 0 ? `'${path}': ${issue.message}` : issue.message;
}

/**
 * @description Parses and validates an RFC 7591 registration request body.
 *
 * - `redirect_uris` is REQUIRED (the platform only supports redirect-based
 *   grants), deduplicated, capped at {@link DYNAMIC_CLIENT_MAX_REDIRECT_URIS},
 *   and every entry must be `https`, an `http` loopback-IP URI, or — when
 *   the deployment allows them — an `http://localhost` URI or a private-use
 *   scheme URI. Violations are `invalid_redirect_uri`.
 * - `token_endpoint_auth_method` defaults to `client_secret_basic` (RFC 7591
 *   §2); `grant_types` to `["authorization_code"]`; `response_types` to
 *   `["code"]`. Values outside the platform's support are
 *   `invalid_client_metadata`, as are the fields listed in
 *   {@link DYNAMIC_CLIENT_UNSUPPORTED_METADATA_FIELDS}.
 * - `client_name` is trimmed and must fit {@link APP_NAME_MAX_LENGTH}; when
 *   absent it is derived from the first redirect URI.
 * - Unknown members are ignored.
 */
export function parseDynamicClientRegistrationRequest(
  body: unknown,
  options: ParseDynamicClientRegistrationRequestOptions,
): ParseDynamicClientRegistrationRequestResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return metadataError("The request body must be a JSON object.");
  }

  for (const field of DYNAMIC_CLIENT_UNSUPPORTED_METADATA_FIELDS) {
    if (field in body && (body as Record<string, unknown>)[field] !== undefined) {
      return metadataError(
        `'${field}' is not supported by this authorization server.`,
      );
    }
  }

  const shape = requestBodyShapeSchema.safeParse(body);
  if (!shape.success) {
    return metadataError(describeFirstIssue(shape.error));
  }
  const raw = shape.data;

  // --- redirect_uris -----------------------------------------------------
  if (!raw.redirect_uris || raw.redirect_uris.length === 0) {
    return redirectUriError(
      "'redirect_uris' is required and must contain at least one URI.",
    );
  }
  const redirect_uris: string[] = [...new Set(raw.redirect_uris)];
  if (redirect_uris.length > DYNAMIC_CLIENT_MAX_REDIRECT_URIS) {
    return redirectUriError(
      `'redirect_uris' may contain at most ${DYNAMIC_CLIENT_MAX_REDIRECT_URIS} URIs.`,
    );
  }
  for (const uri of redirect_uris) {
    switch (classifyDynamicClientRedirectUri(uri)) {
      case "https":
      case "http-loopback":
        break;
      case "http-localhost":
        if (!options.allow_localhost_redirect_uris) {
          return redirectUriError(
            `Redirect URI '${uri}' uses http://localhost, which this authorization server does not accept; use the loopback IP literal (http://127.0.0.1 or http://[::1]) instead.`,
          );
        }
        break;
      case "http-other":
        return redirectUriError(
          `Redirect URI '${uri}' must use https (plain http is only accepted for loopback addresses).`,
        );
      case "custom-scheme":
        if (!options.allow_custom_scheme_redirect_uris) {
          return redirectUriError(
            `Redirect URI '${uri}' uses a private-use scheme, which this authorization server does not accept.`,
          );
        }
        break;
      case "forbidden-scheme":
        return redirectUriError(
          `Redirect URI '${uri}' uses a scheme that can never be a redirect target.`,
        );
      case "invalid":
      default:
        return redirectUriError(
          `Redirect URI '${uri}' is not an absolute URI without a fragment (max ${APP_CALLBACK_URL_MAX_LENGTH} characters).`,
        );
    }
  }

  // --- client_name -------------------------------------------------------
  let client_name: string;
  if (typeof raw.client_name === "string") {
    const trimmed: string = raw.client_name.trim();
    if (trimmed.length === 0) {
      return metadataError("'client_name' must not be blank.");
    }
    if (trimmed.length > APP_NAME_MAX_LENGTH) {
      return metadataError(
        `'client_name' may be at most ${APP_NAME_MAX_LENGTH} characters.`,
      );
    }
    client_name = trimmed;
  } else {
    client_name = deriveDynamicClientNameFromRedirectUri(redirect_uris[0]);
  }

  // --- token_endpoint_auth_method ---------------------------------------
  let token_endpoint_auth_method: DynamicClientTokenEndpointAuthMethod;
  if (typeof raw.token_endpoint_auth_method === "string") {
    const parsed = dynamicClientTokenEndpointAuthMethodSchema.safeParse(
      raw.token_endpoint_auth_method,
    );
    if (!parsed.success) {
      return metadataError(
        `'token_endpoint_auth_method' must be one of: ${DYNAMIC_CLIENT_TOKEN_ENDPOINT_AUTH_METHODS.join(", ")}.`,
      );
    }
    token_endpoint_auth_method = parsed.data;
  } else {
    // RFC 7591 §2: "If unspecified or omitted, the default is
    // client_secret_basic".
    token_endpoint_auth_method = "client_secret_basic";
  }

  // --- grant_types / response_types -------------------------------------
  let grant_types: DynamicClientGrantType[];
  if (raw.grant_types) {
    if (raw.grant_types.length === 0) {
      return metadataError("'grant_types' must not be empty.");
    }
    const parsed = z.array(dynamicClientGrantTypeSchema).safeParse(raw.grant_types);
    if (!parsed.success) {
      return metadataError(
        `'grant_types' may only contain: ${DYNAMIC_CLIENT_GRANT_TYPES.join(", ")}.`,
      );
    }
    grant_types = [...new Set(parsed.data)];
  } else {
    grant_types = ["authorization_code"];
  }

  let response_types: DynamicClientResponseType[];
  if (raw.response_types) {
    if (raw.response_types.length === 0) {
      return metadataError("'response_types' must not be empty.");
    }
    const parsed = z
      .array(dynamicClientResponseTypeSchema)
      .safeParse(raw.response_types);
    if (!parsed.success) {
      return metadataError(
        `'response_types' may only contain: ${DYNAMIC_CLIENT_RESPONSE_TYPES.join(", ")}.`,
      );
    }
    response_types = [...new Set(parsed.data)];
  } else {
    response_types = ["code"];
  }
  // RFC 7591 §2.1: `code` requires the authorization_code grant.
  if (!grant_types.includes("authorization_code")) {
    return metadataError(
      "'grant_types' must include 'authorization_code' (the only way this authorization server issues tokens to dynamically registered clients).",
    );
  }

  // --- scope -------------------------------------------------------------
  let scope: string | null = null;
  if (typeof raw.scope === "string") {
    if (raw.scope.length > 0 && !OIDC_SCOPE_REGEX.test(raw.scope)) {
      return metadataError(
        "'scope' must be a space-separated list of scope tokens (RFC 6749 §3.3).",
      );
    }
    scope = raw.scope.length > 0 ? raw.scope : null;
  }

  return {
    ok: true,
    metadata: {
      redirect_uris,
      client_name,
      token_endpoint_auth_method,
      grant_types,
      response_types,
      client_uri: raw.client_uri ?? null,
      logo_uri: raw.logo_uri ?? null,
      tos_uri: raw.tos_uri ?? null,
      policy_uri: raw.policy_uri ?? null,
      contacts: raw.contacts ? [...raw.contacts] : null,
      scope,
      software_id: raw.software_id ?? null,
      software_version: raw.software_version ?? null,
    },
  };
}

export default parseDynamicClientRegistrationRequest;
