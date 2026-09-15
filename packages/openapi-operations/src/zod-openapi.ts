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
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export { z };
export type { ZodType, ZodObject } from "zod";
