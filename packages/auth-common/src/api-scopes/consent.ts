/**
 * Per-scope user consent: what a user has agreed to let a client
 * application do with an API server, recorded per scope so the consent
 * screen only asks again for what is new (incremental authorization) and
 * the user can withdraw a single scope later.
 */

import { z } from "zod";
import { apiServerIdSchema, appIdSchema } from "@schemavaults/app-definitions";
import { MAX_API_SCOPES_PER_API_SERVER, apiScopeValueSchema } from "./api-server-scope";

/** A scope as a consent screen presents it. */
export const consentScopeSchema = z
  .object({
    api_server_scope_id: z.guid(),
    scope: z.string(),
    description: z.string(),
  })
  .strict();

export type ConsentScope = z.infer<typeof consentScopeSchema>;

/**
 * What the signed-in user would be agreeing to for one authorization
 * request (`GET /api/apps/{app_id}/check-authorization?scope=…&resource=…`).
 */
export const appConsentStatusSchema = z
  .object({
    success: z.literal(true),
    /** Whether the user authorized the app at all (any earlier sign-in). */
    authorized: z.boolean(),
    /**
     * Whether the consent screen must be shown: the app is not authorized
     * yet, or the request asks for API scopes the user has not granted.
     */
    consent_required: z.boolean(),
    /** The OpenID Connect scopes the request asks for (`openid`, `email`, `profile`). */
    requested_oidc_scopes: z.array(z.string()),
    /** The API server whose scopes the request asks for; null when none. */
    api_server: z
      .object({ api_server_id: apiServerIdSchema, api_server_name: z.string() })
      .strict()
      .nullable(),
    /** The requested API scopes the user already granted the app. */
    granted_api_scopes: z.array(consentScopeSchema),
    /** The requested API scopes awaiting the user's decision. */
    pending_api_scopes: z.array(consentScopeSchema),
  })
  .strict();

export type AppConsentStatus = z.infer<typeof appConsentStatusSchema>;

/** The API scopes a user approved on the consent screen (a subset of the pending ones). */
export const approvedApiScopesSchema = z
  .array(apiScopeValueSchema)
  .max(MAX_API_SCOPES_PER_API_SERVER);

/** One API scope a user granted a connected app. */
export const connectedAppScopeSchema = z
  .object({
    api_server_id: apiServerIdSchema,
    api_server_name: z.string(),
    api_server_scope_id: z.guid(),
    scope: z.string(),
    description: z.string(),
    granted_at: z.number().nonnegative(),
  })
  .strict();

export type ConnectedAppScope = z.infer<typeof connectedAppScopeSchema>;

/** A third-party application the user authorized, with what it can access. */
export const connectedAppSchema = z
  .object({
    app_id: appIdSchema,
    app_name: z.string(),
    app_description: z.string(),
    authorized_at: z.number().nonnegative(),
    /** When the app was last issued a token for the user; null if never (or not tracked). */
    last_used_at: z.number().nonnegative().nullable(),
    api_scopes: z.array(connectedAppScopeSchema),
  })
  .strict();

export type ConnectedApp = z.infer<typeof connectedAppSchema>;

export const listConnectedAppsResponseSchema = z
  .object({ success: z.literal(true), list: z.array(connectedAppSchema) })
  .strict();

export type ListConnectedAppsResponse = z.infer<typeof listConnectedAppsResponseSchema>;
