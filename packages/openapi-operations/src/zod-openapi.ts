/**
 * Single zod entrypoint for this package.
 *
 * `@asteasolutions/zod-to-openapi` adds the `.openapi()` method to every zod
 * schema (title, description, examples, refId for `components/schemas`, ...).
 * The extension has to be installed exactly once per zod instance, before any
 * schema that wants to call `.openapi()` is built, so consumers should import
 * `z` from here (or call `extendZodWithOpenApi` themselves on the same zod
 * instance) instead of importing zod directly.
 */
import { z, type ZodType } from "zod";
import {
  extendZodWithOpenApi,
  type ZodOpenAPIMetadata,
} from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export { z };
export type { ZodType, ZodObject } from "zod";

export type OpenApiSchemaMetadata = Partial<ZodOpenAPIMetadata>;

type OpenApiMethodArgs = [metadata: OpenApiSchemaMetadata] | [refId: string, metadata?: OpenApiSchemaMetadata];

/**
 * `schema.openapi(...)` for schemas built BEFORE this package was evaluated.
 *
 * zod v4 copies `ZodType.prototype` methods onto each schema instance when it
 * is constructed, so a schema exported by another package (e.g.
 * `@schemavaults/auth-common`) only has its own `.openapi` when that package
 * happened to be evaluated after this one — which depends on the import order
 * of whichever bundle loads first and throws `... .openapi is not a function`
 * at module load otherwise. Invoking the prototype method explicitly sidesteps
 * that: it returns a fresh copy of the schema carrying the metadata, exactly
 * like a direct call would. Use it for every schema you did not build with the
 * `z` exported from here.
 *
 * ```ts
 * export const App = withOpenApi(schemaVaultsAppDefinitionSchema, "App", { description: "..." });
 * const params = z.object({ app_id: withOpenApi(appIdSchema, { example: "my-app" }) });
 * ```
 */
export function withOpenApi<T extends ZodType>(
  schema: T,
  refIdOrMetadata: string | OpenApiSchemaMetadata,
  metadata?: OpenApiSchemaMetadata,
): T {
  const openapi = z.ZodType.prototype.openapi as unknown as (this: T, ...args: OpenApiMethodArgs) => T;
  return typeof refIdOrMetadata === "string"
    ? openapi.call(schema, refIdOrMetadata, metadata)
    : openapi.call(schema, refIdOrMetadata);
}
