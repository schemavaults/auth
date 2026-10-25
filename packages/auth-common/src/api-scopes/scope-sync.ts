/**
 * Scope sync: a resource server declares its whole list of API scopes in
 * code (a "scope manifest") and sends it to
 * `PUT /api/resource-server/apis/{api_server_id}/scopes`, authenticated
 * with its JWKS access key. The auth server creates the scopes that are
 * missing and updates the ones whose description (or, when the entry
 * gives it, `allow_dynamic_clients`) changed. It never deletes a scope:
 * deleting one drops users' consents and the per-app allowances set for
 * it, so scopes missing from the list are only reported
 * (`not_in_manifest`) and stay a decision for a person in the console.
 *
 * The request schema is also the source of the manifest JSON Schema the
 * auth server serves at {@link API_SERVER_SCOPES_JSON_SCHEMA_PATH}, so
 * editors, the SDK and the endpoint check the same rules.
 */

import { z } from "zod";
import { apiServerIdSchema } from "@schemavaults/app-definitions";
import {
  API_SCOPE_VALUE_REGEX,
  MAX_API_SCOPES_PER_API_SERVER,
  MAX_API_SCOPE_DESCRIPTION_LENGTH,
  MAX_API_SCOPE_VALUE_LENGTH,
  apiScopeDescriptionSchema,
  apiScopeValueSchema,
} from "./api-server-scope";

/**
 * Path (on every auth server deployment) of the JSON Schema of scope
 * manifests; a manifest names `<auth server URL><path>` in its `$schema`.
 */
export const API_SERVER_SCOPES_JSON_SCHEMA_PATH =
  "/json-schema/api-server-scopes.json" as const;

/** One scope of a manifest. */
export const apiScopeManifestEntrySchema = z
  .object({
    scope: apiScopeValueSchema.meta({
      title: "Scope",
      description:
        "The OAuth 2.0 scope value: one RFC 6749 scope-token (printable ASCII without spaces, '\"' or '\\'), at most 128 characters, and never an OpenID Connect scope name. It cannot be renamed once defined.",
      examples: ["notes:read", "notes:write"],
    }),
    description: apiScopeDescriptionSchema.meta({
      title: "Description",
      description:
        "What the scope allows, shown to users on the consent screen (1 to 256 characters after trimming). A changed description updates the scope on the next sync.",
      examples: ["Read your notes."],
    }),
    allow_dynamic_clients: z
      .boolean()
      .optional()
      .meta({
        title: "Allow dynamically registered clients",
        description:
          "Whether dynamically registered clients may be granted this scope. Omit it to keep the current value; a new scope defaults to true.",
        examples: [true],
      }),
  })
  .strict()
  .meta({ title: "API scope" });

export type ApiScopeManifestEntry = z.infer<typeof apiScopeManifestEntrySchema>;
/** An entry as written, before its description is trimmed. */
export type ApiScopeManifestEntryInput = z.input<typeof apiScopeManifestEntrySchema>;

/**
 * Body of `PUT /api/resource-server/apis/{api_server_id}/scopes`, and the
 * shape of a scope manifest file: the API server's whole scope list, at
 * most {@link MAX_API_SCOPES_PER_API_SERVER} entries with no scope value
 * repeated, plus an optional `$schema` the endpoint ignores (so a manifest
 * file is sent as it is).
 */
export const syncApiServerScopesRequestSchema = z
  .object({
    $schema: z
      .string()
      .optional()
      .meta({
        description:
          "URL of this JSON Schema, for editor auto-complete and checks. Ignored by the auth server.",
      }),
    scopes: z
      .array(apiScopeManifestEntrySchema)
      .max(MAX_API_SCOPES_PER_API_SERVER)
      .superRefine((entries, ctx) => {
        const seen = new Set<string>();
        entries.forEach((entry, index) => {
          if (seen.has(entry.scope)) {
            ctx.addIssue({
              code: "custom",
              path: [index, "scope"],
              message: `The scope '${entry.scope}' is listed more than once`,
            });
          }
          seen.add(entry.scope);
        });
      })
      .meta({
        title: "Scopes",
        description: `Every scope the API server defines (at most ${MAX_API_SCOPES_PER_API_SERVER}, each value listed once). Missing scopes are created and changed ones updated; scopes the auth server knows but the list leaves out are reported and never deleted.`,
      }),
  })
  .strict()
  .meta({
    title: "API server scope manifest",
    description:
      "The API scopes a resource server defines, synced to the auth server with `auth-server-sdk sync-scopes` or `syncApiServerScopes()` from `@schemavaults/auth-server-sdk/api-scopes` (PUT /api/resource-server/apis/{api_server_id}/scopes).",
  });

export type SyncApiServerScopesRequest = z.infer<typeof syncApiServerScopesRequestSchema>;
export type SyncApiServerScopesRequestInput = z.input<typeof syncApiServerScopesRequestSchema>;

/**
 * The entries of a manifest given either as a list or as the shorthand
 * `{ [scope]: description }` (which keeps every scope's current
 * `allow_dynamic_clients`). Not validated: parse the result with
 * {@link syncApiServerScopesRequestSchema}.
 */
export function apiScopeManifestEntries(
  scopes:
    | readonly ApiScopeManifestEntryInput[]
    | Readonly<Record<string, string>>,
): ApiScopeManifestEntryInput[] {
  if (Array.isArray(scopes)) {
    return [...(scopes as readonly ApiScopeManifestEntryInput[])];
  }
  return Object.entries(scopes as Readonly<Record<string, string>>).map(
    ([scope, description]) => ({ scope, description }),
  );
}

// Format only (no reserved-name check), like apiServerScopeSchema, so the
// stored definitions always parse on the way out.
const syncedScopeValueSchema = z
  .string()
  .min(1)
  .max(MAX_API_SCOPE_VALUE_LENGTH)
  .regex(API_SCOPE_VALUE_REGEX);
const syncedScopeDescriptionSchema = z
  .string()
  .max(MAX_API_SCOPE_DESCRIPTION_LENGTH);

/** A scope as the sync left it (created, or updated). */
export const syncedApiScopeSchema = z.object({
  scope: syncedScopeValueSchema,
  description: syncedScopeDescriptionSchema,
  allow_dynamic_clients: z.boolean(),
});

export type SyncedApiScope = z.infer<typeof syncedApiScopeSchema>;

/** An updated scope, with the previous values of the fields that changed. */
export const updatedApiScopeSchema = syncedApiScopeSchema.extend({
  previous: z.object({
    description: syncedScopeDescriptionSchema.optional(),
    allow_dynamic_clients: z.boolean().optional(),
  }),
});

export type UpdatedApiScope = z.infer<typeof updatedApiScopeSchema>;

/** What a sync did (or, for a dry run, would do). */
export const apiServerScopeSyncResultSchema = z.object({
  api_server_id: apiServerIdSchema,
  dry_run: z.boolean(),
  /** Scopes that were missing, in manifest order. */
  created: z.array(syncedApiScopeSchema),
  /** Scopes whose description or `allow_dynamic_clients` changed, in manifest order. */
  updated: z.array(updatedApiScopeSchema),
  /** Values of the listed scopes that already matched, in manifest order. */
  unchanged: z.array(syncedScopeValueSchema),
  /** Scopes the API server defines that the manifest leaves out (kept), oldest first. */
  not_in_manifest: z.array(
    z.object({
      scope: syncedScopeValueSchema,
      description: syncedScopeDescriptionSchema,
    }),
  ),
});

export type ApiServerScopeSyncResult = z.infer<typeof apiServerScopeSyncResultSchema>;

/** Success body of `PUT /api/resource-server/apis/{api_server_id}/scopes`. */
export const syncApiServerScopesResponseSchema = z.object({
  success: z.literal(true),
  data: apiServerScopeSyncResultSchema,
});

export type SyncApiServerScopesResponse = z.infer<typeof syncApiServerScopesResponseSchema>;

/** Whether a sync created or updated anything (drift, for `--check`). */
export function hasApiScopeSyncDrift(result: ApiServerScopeSyncResult): boolean {
  return result.created.length > 0 || result.updated.length > 0;
}
