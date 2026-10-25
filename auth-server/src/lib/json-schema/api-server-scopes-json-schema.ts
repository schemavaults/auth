import { z } from "zod";
import {
  API_SERVER_SCOPES_JSON_SCHEMA_PATH,
  OIDC_RESERVED_SCOPES,
  syncApiServerScopesRequestSchema,
} from "@schemavaults/auth-common";

/**
 * The JSON Schema (draft 2020-12) of resource servers' scope manifests,
 * served at `GET /json-schema/api-server-scopes.json`
 * (`src/app/json-schema/api-server-scopes.json/route.ts`). A manifest that
 * names it in `$schema` gets auto-complete, hover text and live checks in
 * editors.
 *
 * Generated from `syncApiServerScopesRequestSchema`, the body schema of
 * `PUT /api/resource-server/apis/{api_server_id}/scopes`, so the editor,
 * the SDK and the endpoint check the same rules. Two rules have no JSON
 * Schema form in the zod definition and are handled here or left to the
 * endpoint:
 * - the OIDC scope names excluded by `apiScopeValueSchema`'s `.refine()`
 *   (dropped by `z.toJSONSchema`) are added back as `not: { enum }`;
 * - "no scope value listed twice" cannot be expressed; the endpoint and the
 *   SDK still refuse it.
 */

export type JsonSchemaDocument = Record<string, unknown>;

function asObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`Unexpected scope manifest JSON Schema shape at ${where}`);
  }
  return value as Record<string, unknown>;
}

/**
 * @param auth_server_url the deployment's own URL (`getAuthServerUrl()`):
 * the document's `$id` is that URL plus
 * {@link API_SERVER_SCOPES_JSON_SCHEMA_PATH}, so white-label deployments
 * name themselves.
 */
export function buildApiServerScopesJsonSchema(auth_server_url: string): JsonSchemaDocument {
  const generated = z.toJSONSchema(syncApiServerScopesRequestSchema, {
    target: "draft-2020-12",
    io: "input",
  }) as JsonSchemaDocument;

  const properties = asObject(generated.properties, "properties");
  const scopes = asObject(properties.scopes, "properties.scopes");
  const entry = asObject(scopes.items, "properties.scopes.items");
  const entryProperties = asObject(entry.properties, "properties.scopes.items.properties");
  const scope = asObject(entryProperties.scope, "properties.scopes.items.properties.scope");
  entryProperties.scope = { ...scope, not: { enum: [...OIDC_RESERVED_SCOPES] } };

  const $id: string = new URL(API_SERVER_SCOPES_JSON_SCHEMA_PATH, auth_server_url).toString();
  const { $schema, ...rest } = generated;
  return {
    $schema,
    $id,
    ...rest,
    examples: [
      {
        $schema: $id,
        scopes: [
          { scope: "notes:read", description: "Read your notes." },
          {
            scope: "notes:write",
            description: "Create, edit and delete your notes.",
            allow_dynamic_clients: true,
          },
        ],
      },
    ],
  };
}
