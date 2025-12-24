import { z } from "zod";
import { userDataSchema } from "./user_data";
import { accessTokenDataSchema, refreshTokenDataSchema } from "./token-data";
import { audienceRefSchema } from "./audience-schema";
import { organizationIdSchema } from "./organizations";
import { appIdSchema } from "@schemavaults/app-definitions";

export const successfullyGeneratedTokensRecordSchema = z
  .object({
    access: z
      .record(
        // map of audience (app id, fs region, or auth server url) to token for that audience
        audienceRefSchema,
        z.union([accessTokenDataSchema, z.literal("AS_HTTP_ONLY_COOKIE")]),
      )
      .optional(),
    refresh: z
      .union([refreshTokenDataSchema, z.literal("AS_HTTP_ONLY_COOKIE")])
      .optional(),
  })
  .strict();

export type SuccessfullyGeneratedTokensRecord = z.infer<
  typeof successfullyGeneratedTokensRecordSchema
>;

const requestTokensSuccessfulResultSchema = z
  .object({
    success: z.literal(true),
    error: z.literal(false),
    message: z.string(),
    client_app_id: appIdSchema,
    tokens: successfullyGeneratedTokensRecordSchema.optional(),
    userData: userDataSchema.optional(),
    userOrgs: organizationIdSchema.array().optional(),
  })
  .required({
    success: true,
    message: true,
    error: true,
    client_app_id: true,
  })
  .strict();

const requestTokensFailureResultSchema = z
  .object({
    success: z.literal(false),
    error: z.literal(true),
    message: z.string(),
  })
  .required({
    success: true,
    message: true,
    error: true,
  })
  .strict();

export const requestTokensResultSchema = z.union([
  requestTokensFailureResultSchema,
  requestTokensSuccessfulResultSchema,
]);

export type RequestTokensResult = z.infer<typeof requestTokensResultSchema>;
