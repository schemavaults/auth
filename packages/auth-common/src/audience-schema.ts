import { apiServerIdSchema, appIdSchema } from "@schemavaults/app-definitions";
import { z } from "zod";
import { fsServerAudienceIdSchema } from "./fs-server-audience-id-schema";

export const appRefIdSchema = z.union([
  appIdSchema,
  apiServerIdSchema,
  fsServerAudienceIdSchema
]);
export const audienceRefSchema = appRefIdSchema;
export const audienceSchema = z.union([audienceRefSchema, audienceRefSchema.array()]);
