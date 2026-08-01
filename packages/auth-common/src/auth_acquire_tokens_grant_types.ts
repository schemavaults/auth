import { PKCE_ProofKeyManager } from "./pkce";
import type { z as zod } from "zod";
import {
  type AudienceSchemaOverrides,
  createAudienceListSchema,
  createAudienceSchema,
} from "./audience-schema";
import {
  appIdSchema,
  getAppEnvironment,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export const grant_types = [
  "authorization_code",
  "refresh_token",
] as const satisfies readonly string[];

function createTokenEndpointBaseSchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  overrides?: AudienceSchemaOverrides,
) {
  return z.object({
    // A single audience, or a (possibly empty) audience list. An empty list
    // mints no access tokens — the grant authenticates (or rotates the
    // refresh token) only, which is how clients configured with no default
    // token audiences complete a login.
    audience: z.union([
      createAudienceSchema(z, environment, overrides),
      createAudienceListSchema(z, environment, overrides),
    ]),
    client_app_id: appIdSchema,
  });
}

export function createAuthorizationCodePOSTBodySchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  overrides?: AudienceSchemaOverrides,
) {
  return createTokenEndpointBaseSchema(z, environment, overrides)
    .extend({
      grant_type: z.literal("authorization_code"),
      code: z.string().min(64).max(1024).base64url(),
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
}

export function createRefreshTokenPOSTBodySchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  overrides?: AudienceSchemaOverrides,
) {
  return createTokenEndpointBaseSchema(z, environment, overrides)
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
}
