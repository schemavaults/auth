import { z } from "zod";
import type { ServerSettingValueType } from "./server-settings-table";
import { apiServerIdSchema } from "@schemavaults/app-definitions";

/**
 * Built-in domain of service-account emails: `.invalid` is reserved by
 * RFC 2606 / RFC 6761, so it never resolves, can never receive mail, and
 * can never be owned by anyone. Always treated as reserved for service
 * accounts, even when an admin configures a different domain.
 */
export const DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN =
  "service-accounts.invalid" as const;

/**
 * A bare, lowercase DNS hostname (RFC 1123 labels joined by dots, at
 * least two labels) — no scheme, path, port, `@`, or trailing dot. This
 * is what goes to the right of the `@` in a service account's email.
 */
export const serviceAccountEmailDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/,
    "Must be a bare DNS hostname such as service-accounts.example.com",
  );

/**
 * Registry of all known server setting keys with their types and defaults.
 * Add new settings here to maintain type safety across the codebase.
 */
export const SERVER_SETTING_DEFINITIONS = {
  invite_code_required: {
    valueType: "boolean" as const,
    defaultValue: true,
    schema: z.boolean(),
    description: "Whether users must provide an invite code to register",
  },
  private_beta_mode: {
    valueType: "boolean" as const,
    defaultValue: false,
    schema: z.boolean(),
    description: "Whether the server is running in private beta mode",
  },
  admin_only_organization_creation: {
    valueType: "boolean" as const,
    defaultValue: false,
    schema: z.boolean(),
    description:
      "Whether only admins can create new organizations. When false, any non-disabled user can create organizations.",
  },
  require_email_verification_for_third_party_apps: {
    valueType: "boolean" as const,
    defaultValue: true,
    schema: z.boolean(),
    description:
      "Whether users must verify their email address before the auth server hands them off to a third-party client application (OAuth2 / OIDC authorization code flows). While on, login, registration and the authorize bridge park unverified accounts on the 'verify your email to continue' page instead of redirecting them to the requesting app. The auth server's own account pages stay accessible to unverified accounts either way.",
  },
  allow_user_owned_resource_creation: {
    valueType: "boolean" as const,
    defaultValue: true,
    schema: z.boolean(),
    description:
      "Whether non-admin users may create client applications and API servers owned directly by their own account (outside of any organization). Admins can always create them.",
  },
  allow_dynamic_client_registration: {
    valueType: "boolean" as const,
    defaultValue: false,
    schema: z.boolean(),
    description:
      "Whether anonymous OAuth 2.0 Dynamic Client Registration (RFC 7591) is enabled at POST /api/oidc/register, e.g. for MCP clients. Registered clients have no owner and are managed by administrators only; the discovery document advertises registration_endpoint only while this is on.",
  },
  dynamic_client_registration_allow_localhost_redirect_uris: {
    valueType: "boolean" as const,
    defaultValue: true,
    schema: z.boolean(),
    description:
      "Whether dynamic client registration accepts http://localhost redirect URIs (matched port-exactly). The loopback IP literals http://127.0.0.1 and http://[::1] (RFC 8252 §7.3, any port) and https URIs are always accepted.",
  },
  dynamic_client_registration_allow_custom_scheme_redirect_uris: {
    valueType: "boolean" as const,
    defaultValue: true,
    schema: z.boolean(),
    description:
      "Whether dynamic client registration accepts private-use URI scheme redirect URIs such as com.example.app:/callback or vscode://... (RFC 8252 §7.1) for native clients.",
  },
  mail_server_configured: {
    valueType: "boolean" as const,
    defaultValue: false,
    schema: z.boolean(),
    description: "Whether a @schemavaults/mail-server has been configured for sending mail."
  },
  mail_server_api_id: {
    valueType: "string" as const,
    defaultValue: "schemavaults-mail",
    schema: apiServerIdSchema,
    description: "API server ID of a @schemavaults/mail-server instance for sending mail."
  },
  spoofed_superuser_email: {
    valueType: "string" as const,
    defaultValue: "admin@schemavaults.com",
    schema: z.email(),
    description:
      "Email address embedded as the identity claim in internally-minted (spoofed) superuser access tokens, e.g. the token the auth server uses to authorize with the mail-server.",
  },
  service_account_email_domain: {
    valueType: "string" as const,
    defaultValue: DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN,
    schema: serviceAccountEmailDomainSchema,
    description:
      "Domain of the synthetic email addresses given to client applications' service accounts (the subjects of OAuth2 client_credentials tokens), e.g. service-accounts.auth.example.com. Nobody can register an account under this domain (nor under the built-in default, service-accounts.invalid). Use a domain you control, or leave the reserved .invalid default, which can never receive mail.",
  },
  accept_client_error_reports: {
    valueType: "boolean" as const,
    defaultValue: true,
    schema: z.boolean(),
    description:
      "Whether the auth server stores the error reports client applications send to POST /api/client-errors/{client_app_id} (the auth client SDK reports its own failures unless an app sets disable_telemetry). While off, reports are refused with 403 and the SDK stops sending them; reports already stored stay browsable on /admin/client-errors.",
  },
  client_error_reports_max_storage_mb: {
    valueType: "number" as const,
    defaultValue: 100,
    schema: z.number().int().min(1).max(1_000_000),
    description:
      "Most storage, in megabytes, that client error reports may take up (the size of their contents). Once reached, new reports are refused with 503 until reports are deleted (on /admin/client-errors, or by the retention period) or the limit is raised.",
  },
  client_error_reports_retention_days: {
    valueType: "number" as const,
    defaultValue: 30,
    schema: z.number().int().min(0).max(3650),
    description:
      "How many days client error reports are kept; older reports are deleted automatically by the daily scheduled job (GET /api/admin/client-errors/purge-expired) and, at most once an hour, while reports arrive or the dashboard is open. 0 keeps reports until an administrator deletes them.",
  },
} as const satisfies Record<
  string,
  {
    valueType: ServerSettingValueType;
    defaultValue: unknown;
    schema: z.ZodType;
    description: string;
  }
>;

/**
 * Union type of all valid server setting keys
 */
export type ServerSettingKey = keyof typeof SERVER_SETTING_DEFINITIONS;

/**
 * Map of setting keys to their value types
 */
export type ServerSettingValueTypes = {
  [K in ServerSettingKey]: z.infer<
    (typeof SERVER_SETTING_DEFINITIONS)[K]["schema"]
  >;
};

/**
 * Type-safe helper to get the default value for a setting
 */
export function getDefaultValue<K extends ServerSettingKey>(
  key: K
): ServerSettingValueTypes[K] {
  return SERVER_SETTING_DEFINITIONS[key]
    .defaultValue as ServerSettingValueTypes[K];
}

/**
 * Type-safe helper to get the schema for a setting
 */
export function getSettingSchema<K extends ServerSettingKey>(
  key: K
) {
  return SERVER_SETTING_DEFINITIONS[key].schema;
}

/**
 * Type-safe helper to get the value type for a setting
 */
export function getSettingValueType<K extends ServerSettingKey>(
  key: K
): ServerSettingValueType {
  return SERVER_SETTING_DEFINITIONS[key].valueType;
}

/**
 * Check if a key is a valid server setting key
 */
export function isValidServerSettingKey(key: string): key is ServerSettingKey {
  return key in SERVER_SETTING_DEFINITIONS;
}

/**
 * Get all known setting keys
 */
export function getAllSettingKeys(): readonly ServerSettingKey[] {
  return Object.keys(SERVER_SETTING_DEFINITIONS) as ServerSettingKey[];
}
