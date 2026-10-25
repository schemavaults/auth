import {
  apiServerIdSchema,
  isHardcodedApiServerId,
  type ApiServerId,
} from "@schemavaults/app-definitions";
import {
  API_SERVER_SCOPES_JSON_SCHEMA_PATH,
  MAX_API_SCOPES_PER_API_SERVER,
  syncApiServerScopesRequestSchema,
  syncApiServerScopesResponseSchema,
  type ApiServerScopeSyncResult,
} from "@schemavaults/auth-common";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { jwksAccessAssertionScheme } from "@/lib/api/auth-schemes";
import {
  jwksAssertionErrorResponses,
  ResourceServerBadRequestResponse,
} from "@/lib/api/domain-schemas/resource-servers";
import { ErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { syncApiServerScopes as syncScopes } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import { ConflictError } from "@/lib/error/ConflictError";

const ROUTE = "/api/resource-server/apis/{api_server_id}/scopes";
const ROUTE_FOLDER = "/api/resource-server/apis/[api_server_id]/scopes";

export const SyncApiServerScopesRequest = withOpenApi(
  syncApiServerScopesRequestSchema,
  "SyncApiServerScopesRequest",
  {
    description: `A scope manifest: every scope the API server defines (at most ${MAX_API_SCOPES_PER_API_SERVER}, no value repeated). \`scope\`: a single RFC 6749 scope-token (printable ASCII without spaces, \`"\` or \`\\\`, at most 128 characters) that is not an OpenID Connect scope name. \`description\`: 1 to 256 characters, shown to users. \`allow_dynamic_clients\`: whether dynamically registered clients may be granted the scope; omit it to keep the current value (new scopes default to true). \`$schema\` is ignored, so a manifest file validated against \`${API_SERVER_SCOPES_JSON_SCHEMA_PATH}\` is sent as it is. Unknown keys are rejected.`,
    example: {
      scopes: [
        { scope: "notes:read", description: "Read your notes." },
        { scope: "notes:write", description: "Create, edit and delete your notes.", allow_dynamic_clients: true },
      ],
    },
  },
);

export const SyncApiServerScopesResponse = withOpenApi(
  syncApiServerScopesResponseSchema,
  "SyncApiServerScopesResponse",
  {
    description:
      "What the sync did (or, for a dry run, would do): `created` and `updated` scopes (`previous` holds the earlier values of the fields that changed), the values of the listed scopes that were `unchanged`, and the scopes the API server defines that the list leaves out (`not_in_manifest`), which are kept.",
  },
);

/**
 * Lets a resource server define its API scopes from code: it sends its
 * whole scope list (a manifest) and the auth server creates the missing
 * scopes and updates the changed ones, never deleting any. Authenticated
 * with the API server's own JWKS access key.
 */
export const syncResourceServerApiScopes = defineOperation({
  method: "put",
  path: ROUTE,
  summary: "Sync a resource server's API scopes",
  description: `Brings the API scopes the auth server holds for an API server in line with the list its resource server declares in code, in one transaction: scopes the list adds are created (with no \`created_by\`), and a listed scope whose description differs, or whose \`allow_dynamic_clients\` differs when the entry gives it, is updated. Nothing is ever deleted: deleting a scope drops users' consents and the per-app allowances set for it, so the scopes the list leaves out come back as \`not_in_manifest\` for a person to delete in the console. Per-app scope allowances and the API server's own dynamic-client policy are not touched. With \`dry_run=true\` the same diff is computed and nothing is written, so CI can fail on drift. Any invalid entry refuses the whole list (400), and a list that would take the API server over ${MAX_API_SCOPES_PER_API_SERVER} scopes is refused with 409. Manifest files can name the JSON Schema served at \`${API_SERVER_SCOPES_JSON_SCHEMA_PATH}\` in their \`$schema\` for editor auto-complete and checks. Resource servers built on \`@schemavaults/auth-server-sdk\` call this with \`syncApiServerScopes()\` (\`@schemavaults/auth-server-sdk/api-scopes\`) or \`auth-server-sdk sync-scopes --manifest <path>\`; run it once per environment's auth server, before deploying code that requires a new scope.`,
  tags: [API_TAGS.resourceServers],
  auth: requireAuth({
    schemes: [jwksAccessAssertionScheme],
    notes:
      "The assertion's `iss` / `sub` must equal the `api_server_id` path parameter, so a resource server can only define its own API scopes. Every assertion is accepted once.",
  }),
  request: {
    params: z.object({
      api_server_id: withOpenApi(apiServerIdSchema, {
        description: "API server id; must equal the assertion's issuer",
        example: "notes-api",
      }),
    }),
    query: z.object({
      dry_run: z.enum(["true", "false"]).optional().openapi({
        description: "`true` reports what the sync would do without writing anything",
        example: "true",
      }),
    }),
    body: { schema: SyncApiServerScopesRequest },
  },
  responses: {
    200: { description: "What the sync did (or would do)", schema: SyncApiServerScopesResponse },
    ...jwksAssertionErrorResponses,
    400: {
      description:
        "The body failed validation (an invalid or reserved scope value, a missing or over-long description, a repeated value, more than 100 entries, an unknown key), the path id is not a valid API server id or names the auth server itself, or the API server is hardcoded (`hardcoded_api_server`)",
      schema: ResourceServerBadRequestResponse,
    },
    404: { description: "No such API server is registered (`api_server_not_found`)", schema: ErrorResponse },
    409: {
      description: `Creating the missing scopes would take the API server over ${MAX_API_SCOPES_PER_API_SERVER} scopes (\`too_many_scopes\`)`,
      schema: ErrorResponse,
    },
    500: { description: "Failed to sync the scopes (`internal_error`)", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const { db } = ctx.context;
    // The resolver verified the assertion for this very id (ctx.auth.clientId).
    const api_server_id: ApiServerId = ctx.params.api_server_id;
    const dry_run: boolean = ctx.query.dry_run === "true";

    if (isHardcodedApiServerId(api_server_id)) {
      return ctx.json(400, {
        success: false,
        error: "hardcoded_api_server",
        message: "Hardcoded API servers cannot define API scopes",
      });
    }

    let result: ApiServerScopeSyncResult | null;
    try {
      result = await syncScopes(db, { api_server_id, scopes: ctx.body.scopes, dry_run });
    } catch (e: unknown) {
      if (e instanceof ConflictError) {
        return ctx.json(409, { success: false, error: "too_many_scopes", message: e.message });
      }
      await captureServerException(db, e, {
        op_name: "resource-server-api-scopes.sync",
        route: ROUTE_FOLDER,
        context: { api_server_id, dry_run, scopes: ctx.body.scopes.length },
      });
      return ctx.json(500, { success: false, error: "internal_error", message: "Failed to sync the API scopes" });
    }
    if (!result) {
      return ctx.json(404, {
        success: false,
        error: "api_server_not_found",
        message: "No such API server is registered",
      });
    }

    return ctx.json(200, { success: true, data: result }, { headers: { "Cache-Control": "no-store" } });
  },
});
