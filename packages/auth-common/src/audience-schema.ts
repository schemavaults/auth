import { apiServerIdSchema, appIdSchema } from "@schemavaults/app-definitions";
import { z } from "zod";

export const appRefIdSchema = z.union([
  appIdSchema,
  apiServerIdSchema,
]);
export const audienceRefSchema = appRefIdSchema;

const MAX_APPS_IN_AUDIENCE_LIST = 10 as const satisfies number;

export const audienceSchema = z.union([
  audienceRefSchema,
  audienceRefSchema.array()
    .min(1, "Audience list may not be empty")
    .max(MAX_APPS_IN_AUDIENCE_LIST, `Audience list may not contain more than ${MAX_APPS_IN_AUDIENCE_LIST} audience references.`)
]);
