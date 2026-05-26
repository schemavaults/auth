import { PKCE_ProofKeyManager } from "./pkce";
import { type ZodSchema, z } from "zod";
import { audienceSchema } from "./audience-schema";
import { appIdSchema } from "@schemavaults/app-definitions";

export const grant_types = [
  "authorization_code",
  "refresh_token",
] as const satisfies readonly string[];

const _createTokenEndpointBaseSchema = z.object({
  audience: audienceSchema,
  client_app_id: appIdSchema,
});

export const authorizationCodePOSTbody = _createTokenEndpointBaseSchema
  .extend({
    grant_type: z.literal("authorization_code"),
    code: z
      .string()
      .min(64)
      .max(1024)
      .refine((value) => /^[A-Za-z0-9_-]+$/.test(value)),
    code_verifier: PKCE_ProofKeyManager.codeChallengeSchema,
    challenge_time: z.number().nonnegative(),
    // OAuth2 `redirect_uri` (RFC 6749 §4.1.3) bound to the issued
    // authorization code. The token endpoint verifies this matches the
    // value persisted on the authorization_codes row by exact string
    // equality, so a code minted for URI A cannot be redeemed by
    // presenting URI B even when both share an allowlisted origin.
    // Null/absent is reserved for the auth server's own account flow,
    // which has no third-party callback.
    redirect_uri: z.string().url().nullable().optional(),
  })
  .required({
    grant_type: true,
    audience: true,
    client_app_id: true,
    code: true,
    code_verifier: true,
    challenge_time: true,
  })
  .strict();

export const refreshTokenPOSTbody = _createTokenEndpointBaseSchema
  .extend({
    grant_type: z.literal("refresh_token"),
    replaceRefreshToo: z.boolean().optional(),
  })
  .required({
    grant_type: true,
    audience: true,
    client_app_id: true,
  })
  .strict();

export const grantTypePOSTbodySchemaMap = {
  authorization_code: authorizationCodePOSTbody,
  refresh_token: refreshTokenPOSTbody,
} as const satisfies Record<(typeof grant_types)[number], ZodSchema>;
