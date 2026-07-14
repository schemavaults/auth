import type { z as zod } from "zod";
import { userDataSchema } from "./user_data";
import { accessTokenDataSchema, refreshTokenDataSchema } from "./token-data";
import { createAudienceSchema } from "./audience-schema";
import { organizationIdSchema } from "./organizations";
import { oidcNonceSchema } from "./oidc/nonce";
import {
  appIdSchema,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

// NOTE: These schemas are exposed as factories (rather than module-scope
// constants) because the audience schema depends on the app environment and
// auth-server URL, which must be resolved at call time. Eager module-scope
// initialization breaks `next build` in Docker where those env vars are unset.

export function createSuccessfullyGeneratedTokensRecordSchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
) {
  return z
    .object({
      access: z
        .record(
          // map of audience (app id, fs region, or auth server url) to token for that audience
          createAudienceSchema(z, environment),
          z.union([accessTokenDataSchema, z.literal("AS_HTTP_ONLY_COOKIE")]),
        )
        .optional(),
      refresh: z
        .union([refreshTokenDataSchema, z.literal("AS_HTTP_ONLY_COOKIE")])
        .optional(),
      refresh_token_expiry: z.number().optional(),
    })
    .strict()
    .refine((values): boolean => {
      if (values.refresh === "AS_HTTP_ONLY_COOKIE") {
        if (
          typeof values.refresh_token_expiry === "number" &&
          !isNaN(values.refresh_token_expiry)
        ) {
          return true;
        } else {
          return false;
        }
      }

      return true;
    }, `A value must be supplied for 'refresh_token_expiry' if refresh token is passed 'AS_HTTP_ONLY_COOKIE'!`)
    .refine((values): boolean => {
      if (values.refresh && typeof values.refresh === "object") {
        if (typeof values.refresh_token_expiry === "number") {
          return false;
        }
      }
      return true;
    }, "Passing 'refresh_token_expiry' is redundant when refresh token is passed as an object!");
}

export type SuccessfullyGeneratedTokensRecord = zod.infer<
  ReturnType<typeof createSuccessfullyGeneratedTokensRecordSchema>
>;

export function createRequestTokensResultSchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
) {
  const requestTokensSuccessfulResultSchema = z
    .object({
      success: z.literal(true),
      error: z.literal(false),
      message: z.string(),
      client_app_id: appIdSchema,
      tokens: createSuccessfullyGeneratedTokensRecordSchema(
        z,
        environment,
      ).optional(),
      userData: userDataSchema.optional(),
      userOrgs: organizationIdSchema.array().optional(),
      // Echo of the login-time replay nonce bound to the redeemed
      // authorization code — the custom surface's analogue of the OIDC
      // id_token `nonce` claim; the SDK verifies it against the value it
      // stored at redirect time. Absent on refresh grants and on codes
      // minted before nonces became first-class. Validated with the shared
      // `oidcNonceSchema` (the same schema that gated it at the login
      // boundary) so the echo round-trip is symmetric.
      nonce: oidcNonceSchema.optional(),
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

  return z.union([
    requestTokensFailureResultSchema,
    requestTokensSuccessfulResultSchema,
  ]);
}

export type RequestTokensResult = zod.infer<
  ReturnType<typeof createRequestTokensResultSchema>
>;
