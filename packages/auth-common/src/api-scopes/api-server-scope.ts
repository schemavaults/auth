/**
 * API scopes: the OAuth 2.0 scope values (RFC 6749 §3.3) an API server
 * (resource server) defines for itself, e.g. `notes:read` or
 * `https://api.example.com/auth/drive`, each with a human readable
 * description for consent screens. A client asks for them on an
 * authorization request that names the API server as its RFC 8707
 * `resource`; the auth server grants the requested scopes the API server
 * defines and stamps them on the access tokens it mints for that API
 * server, whose route guards enforce them (`requiredScopes`).
 *
 * The OIDC scope names (`OIDC_RESERVED_SCOPES`) can never be API scopes,
 * so a granted scope string splits unambiguously into its OIDC and API
 * parts (`partitionGrantedScopes`).
 */

import { z } from "zod";
import { apiServerIdSchema } from "@schemavaults/app-definitions";
import { isOidcReservedScope } from "../oidc/scope";

export const MAX_API_SCOPE_VALUE_LENGTH = 128 as const;
export const MAX_API_SCOPE_DESCRIPTION_LENGTH = 256 as const;
/** Upper bound on the scopes one API server may define. */
export const MAX_API_SCOPES_PER_API_SERVER = 100 as const;

/**
 * One RFC 6749 §3.3 scope-token: printable ASCII except SP, `"` and `\`.
 */
export const API_SCOPE_VALUE_REGEX: RegExp = /^[\x21\x23-\x5B\x5D-\x7E]+$/;

/**
 * A scope value an API server may define: a single RFC 6749 scope-token
 * that is not one of the OIDC scope names.
 */
export const apiScopeValueSchema = z
  .string()
  .min(1)
  .max(MAX_API_SCOPE_VALUE_LENGTH)
  .regex(API_SCOPE_VALUE_REGEX, {
    message:
      "A scope must be a single RFC 6749 scope-token: printable ASCII without spaces, '\"' or '\\'",
  })
  .refine((scope) => !isOidcReservedScope(scope), {
    message:
      "OpenID Connect scope names (openid, profile, email, address, phone, offline_access) cannot be defined as API scopes",
  });

export type ApiScopeValue = z.infer<typeof apiScopeValueSchema>;

/** What a consent screen tells the user the scope allows. */
export const apiScopeDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_API_SCOPE_DESCRIPTION_LENGTH);

/**
 * An RFC 8707 `resource` value carried through an authorization flow (the
 * login / register / session code requests): an API server id or the URL
 * of one of its registered domains. Only bounded here; the auth server
 * resolves it, and ignores a value it cannot honour.
 */
export const resourceIndicatorSchema = z.string().min(1).max(2048);

/** A scope defined by an API server. */
export const apiServerScopeSchema = z
  .object({
    api_server_scope_id: z.guid(),
    api_server_id: apiServerIdSchema,
    // Format only (no reserved-name check), so a stored definition always
    // parses on the way out.
    scope: z
      .string()
      .min(1)
      .max(MAX_API_SCOPE_VALUE_LENGTH)
      .regex(API_SCOPE_VALUE_REGEX),
    description: z.string().max(MAX_API_SCOPE_DESCRIPTION_LENGTH),
    // Whether clients registered through RFC 7591 dynamic client
    // registration (which have no app-to-API connection to carry an
    // allowance) may be granted the scope. Only meaningful while the API
    // server allows dynamic clients at all.
    allow_dynamic_clients: z.boolean(),
    created_at: z.number().nonnegative(),
    created_by: z.guid().nullable(),
  })
  .strict();

export type ApiServerScope = z.infer<typeof apiServerScopeSchema>;

/** Body of a request defining a new scope on an API server. */
export const createApiServerScopeRequestSchema = z
  .object({
    scope: apiScopeValueSchema,
    description: apiScopeDescriptionSchema,
    /** Defaults to true. */
    allow_dynamic_clients: z.boolean().optional(),
  })
  .strict();

export type CreateApiServerScopeRequest = z.infer<
  typeof createApiServerScopeRequestSchema
>;

/**
 * Body of a request changing a scope's description and/or whether dynamic
 * clients may be granted it. The scope value itself is immutable: tokens
 * already carry it, so a rename is a new scope plus a deletion.
 */
export const updateApiServerScopeRequestSchema = z
  .object({
    description: apiScopeDescriptionSchema.optional(),
    allow_dynamic_clients: z.boolean().optional(),
  })
  .strict()
  .refine(
    (update) =>
      update.description !== undefined ||
      update.allow_dynamic_clients !== undefined,
    "At least one of 'description' and 'allow_dynamic_clients' must be provided",
  );

export type UpdateApiServerScopeRequest = z.infer<
  typeof updateApiServerScopeRequestSchema
>;
