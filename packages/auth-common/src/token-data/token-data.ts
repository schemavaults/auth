import { organizationIdSchema } from "@/organizations";
import { z } from "zod";

const validTokenTypes = z.union([z.literal("refresh"), z.literal("access")]);
export type AuthTokenTypes = z.infer<typeof validTokenTypes>;

export const tokenDataSchema = z
  .object({
    type: validTokenTypes,
    uid: z.string(),
    iat: z.number(),
    exp: z.number(),
    token: z.string(),
    aud: z.string(),
    orgs: organizationIdSchema.array().optional(),
  })
  .required({
    type: true,
    uid: true,
    iat: true,
    exp: true,
    token: true,
    aud: true,
  })
  .strict();

/**
 * @name AuthToken
 * @description An object which contains a JSON web token. Contains details about the token (e.g. expiry, audience).
 * @see RefreshToken
 * @see AccessToken
 */
export type AuthToken = z.infer<typeof tokenDataSchema>;

export const refreshTokenDataSchema = tokenDataSchema.extend({
  type: z.literal("refresh"),
});

export const accessTokenDataSchema = tokenDataSchema.extend({
  type: z.literal("access"),
});

/**
 * @name RefreshToken
 * @description An object which contains a refresh token. Also contains details about the token (e.g. expiry, audience)
 * @extends AuthToken
 */
export type RefreshToken = z.infer<typeof refreshTokenDataSchema>;

/**
 * @name AccessToken
 * @description An object which contains an access token. Also contains details about the token (e.g. expiry, audience)
 * @extends AuthToken
 */
export type AccessToken = z.infer<typeof accessTokenDataSchema>;
