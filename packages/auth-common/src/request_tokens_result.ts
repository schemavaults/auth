import { z } from "zod";
import { userDataSchema } from "./user_data";
import { accessTokenDataSchema, refreshTokenDataSchema } from "./token-data";
import { audienceRefSchema } from "./audience-schema";

export const requestTokensResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  tokens: z.object({
    access: z.record( // map of audience (app id, fs region, or auth server url) to token for that audience
      audienceRefSchema,
      accessTokenDataSchema
    ).optional(),
    refresh: refreshTokenDataSchema.optional()
  }).optional(),
  userData: userDataSchema.optional()
}).required({
  success: true,
  message: true
}).strict();

export type RequestTokensResult = z.infer<typeof requestTokensResultSchema>;
