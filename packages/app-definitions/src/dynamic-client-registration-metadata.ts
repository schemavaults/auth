import { z } from "zod";

/**
 * RFC 7591 client metadata persisted for a client application registered
 * through OAuth 2.0 Dynamic Client Registration (`POST /api/oidc/register`).
 *
 * Every field is optional and nullable on the wire: client applications
 * created through the management console never carry them (their columns
 * are NULL), and older SDK consumers do not know about them. The
 * registration endpoint's request parser (`@schemavaults/auth-common`,
 * `parseDynamicClientRegistrationRequest`) is what validates the values a
 * registering client sends; these shapes only describe what is stored and
 * echoed back.
 */

/**
 * Token endpoint client authentication methods a dynamically registered
 * client may pick (RFC 7591 §2, RFC 6749 §2.3). `none` registers a public
 * (PKCE-only) client; the two secret-based methods register a confidential
 * client and are issued a `client_secret`. `private_key_jwt` /
 * `client_secret_jwt` are not supported by the token endpoint.
 */
export const DYNAMIC_CLIENT_TOKEN_ENDPOINT_AUTH_METHODS = [
  "none",
  "client_secret_basic",
  "client_secret_post",
] as const satisfies readonly string[];

export type DynamicClientTokenEndpointAuthMethod =
  (typeof DYNAMIC_CLIENT_TOKEN_ENDPOINT_AUTH_METHODS)[number];

export const dynamicClientTokenEndpointAuthMethodSchema = z.enum(
  DYNAMIC_CLIENT_TOKEN_ENDPOINT_AUTH_METHODS,
);

/**
 * Grant types a dynamically registered client may declare. The
 * `client_credentials` grant needs a per-app service account, which is a
 * managed-app feature, so anonymous registrations cannot request it.
 */
export const DYNAMIC_CLIENT_GRANT_TYPES = [
  "authorization_code",
  "refresh_token",
] as const satisfies readonly string[];

export type DynamicClientGrantType = (typeof DYNAMIC_CLIENT_GRANT_TYPES)[number];

export const dynamicClientGrantTypeSchema = z.enum(DYNAMIC_CLIENT_GRANT_TYPES);

/**
 * Response types a dynamically registered client may declare: the auth
 * server only implements the authorization code flow.
 */
export const DYNAMIC_CLIENT_RESPONSE_TYPES = [
  "code",
] as const satisfies readonly string[];

export type DynamicClientResponseType =
  (typeof DYNAMIC_CLIENT_RESPONSE_TYPES)[number];

export const dynamicClientResponseTypeSchema = z.enum(
  DYNAMIC_CLIENT_RESPONSE_TYPES,
);

export const DYNAMIC_CLIENT_METADATA_URI_MAX_LENGTH = 2048 as const;
export const DYNAMIC_CLIENT_MAX_CONTACTS = 20 as const;
export const DYNAMIC_CLIENT_CONTACT_MAX_LENGTH = 320 as const;
export const DYNAMIC_CLIENT_SOFTWARE_FIELD_MAX_LENGTH = 255 as const;
export const DYNAMIC_CLIENT_SCOPE_MAX_LENGTH = 1024 as const;

const optionalUri = z
  .url()
  .max(DYNAMIC_CLIENT_METADATA_URI_MAX_LENGTH)
  .nullable()
  .optional();

/**
 * The stored RFC 7591 metadata fields, spread into the client application
 * definition schema. Names follow RFC 7591 §2 except where they would
 * collide with existing definition fields (`scope` is stored as
 * `registered_scope` because the definition has no scope semantics of its
 * own; `client_name` maps onto `app_name`).
 */
export const dynamicClientRegistrationMetadataFieldsShape = {
  /** RFC 7591 `client_uri`: the client's home page. */
  client_uri: optionalUri,
  /** RFC 7591 `logo_uri`. */
  logo_uri: optionalUri,
  /** RFC 7591 `tos_uri`. */
  tos_uri: optionalUri,
  /** RFC 7591 `policy_uri`. */
  policy_uri: optionalUri,
  /** RFC 7591 `contacts`: ways to contact people responsible for the client. */
  contacts: z
    .array(z.string().max(DYNAMIC_CLIENT_CONTACT_MAX_LENGTH))
    .max(DYNAMIC_CLIENT_MAX_CONTACTS)
    .nullable()
    .optional(),
  /** RFC 7591 `grant_types` the client declared at registration. */
  grant_types: z.array(dynamicClientGrantTypeSchema).nullable().optional(),
  /** RFC 7591 `response_types` the client declared at registration. */
  response_types: z
    .array(dynamicClientResponseTypeSchema)
    .nullable()
    .optional(),
  /** RFC 7591 `token_endpoint_auth_method` the client declared. */
  token_endpoint_auth_method:
    dynamicClientTokenEndpointAuthMethodSchema.nullable().optional(),
  /** RFC 7591 `software_id`. */
  software_id: z
    .string()
    .max(DYNAMIC_CLIENT_SOFTWARE_FIELD_MAX_LENGTH)
    .nullable()
    .optional(),
  /** RFC 7591 `software_version`. */
  software_version: z
    .string()
    .max(DYNAMIC_CLIENT_SOFTWARE_FIELD_MAX_LENGTH)
    .nullable()
    .optional(),
  /**
   * RFC 7591 `scope`: the space-separated scopes the client said it will
   * request. Recorded for operators; not enforced at the authorize or
   * token endpoints (scope handling there is unchanged).
   */
  registered_scope: z
    .string()
    .max(DYNAMIC_CLIENT_SCOPE_MAX_LENGTH)
    .nullable()
    .optional(),
  /**
   * RFC 7591 `client_id_issued_at`, in seconds since the Unix epoch (the
   * RFC's unit; note the definition's `created_at` is in milliseconds).
   */
  client_id_issued_at: z.number().int().nonnegative().nullable().optional(),
} as const;

export const dynamicClientRegistrationMetadataFieldsSchema = z.object(
  dynamicClientRegistrationMetadataFieldsShape,
);

export type DynamicClientRegistrationMetadataFields = z.infer<
  typeof dynamicClientRegistrationMetadataFieldsSchema
>;

export default dynamicClientRegistrationMetadataFieldsSchema;
