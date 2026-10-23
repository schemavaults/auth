/**
 * Per-app scope allowances ("client grants"): which of an API server's
 * scopes a connected client application may be granted.
 *
 * - `user` allowance: the scopes users may delegate to the app on an
 *   authorization request. By default unrestricted (every scope the API
 *   server defines; each user still consents per scope); an API server
 *   owner may restrict it to a list.
 * - `service_account` allowance: the scopes the app's own service account
 *   gets on the client_credentials grant, where no user consents. Empty by
 *   default: machine-to-machine tokens carry an API scope only when the API
 *   server owner listed it for that app.
 *
 * Dynamically registered clients have no connection; they may be granted
 * the scopes flagged `allow_dynamic_clients` on the API server.
 */

import { z } from "zod";
import { MAX_API_SCOPES_PER_API_SERVER, apiScopeValueSchema } from "./api-server-scope";

export const API_SCOPE_GRANTEES = ["user", "service_account"] as const;
export type ApiScopeGrantee = (typeof API_SCOPE_GRANTEES)[number];
export const apiScopeGranteeSchema = z.enum(API_SCOPE_GRANTEES);

const scopeValueListSchema = z
  .array(apiScopeValueSchema)
  .max(MAX_API_SCOPES_PER_API_SERVER)
  .refine((values) => new Set(values).size === values.length, {
    message: "Scope values must be unique",
  });

/** The scope allowances of one app-to-API connection. */
export const appApiScopePolicySchema = z
  .object({
    /**
     * False (the default): users may grant the app every scope the API
     * server defines. True: only `user_scopes`.
     */
    restrict_user_scopes: z.boolean(),
    /** The scopes users may grant when `restrict_user_scopes` is on. */
    user_scopes: z.array(z.string()),
    /** The scopes the app's service account gets (client_credentials). */
    service_account_scopes: z.array(z.string()),
  })
  .strict();

export type AppApiScopePolicy = z.infer<typeof appApiScopePolicySchema>;

/** Body replacing the scope allowances of an app-to-API connection. */
export const updateAppApiScopePolicyRequestSchema = z
  .object({
    restrict_user_scopes: z.boolean(),
    user_scopes: scopeValueListSchema,
    service_account_scopes: scopeValueListSchema,
  })
  .strict();

export type UpdateAppApiScopePolicyRequest = z.infer<
  typeof updateAppApiScopePolicyRequestSchema
>;
