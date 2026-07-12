import type { z as zod } from "zod";
import {
  appIdSchema,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
} from "@schemavaults/app-definitions";
import { createAudienceSchema } from "@schemavaults/auth-common";

// Data to hold in the JWT
export function createJwtPayloadSchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
) {
  return z
    .object({
      uid: z.string().uuid(),
      sub: z.string().uuid(),
      email: z.string().email(),
      email_verified: z.boolean(),
      aud: createAudienceSchema(z, environment), // Backend resource API UUID, either auth server url or a registered api server's unique UUID
      app: appIdSchema, // Frontend client app UUID, either auth server url or a registered app's unique UUID
      admin: z.boolean(),
      disabled: z.boolean(),
      created_at: z.number().refine(
        // What time the user was created at
        (creation_time): boolean => {
          return (creation_time <= Date.now()) satisfies boolean;
        },
        "Creation time must not be in the future",
      ),
      sig: z.string().min(32).max(4096),
      iss: z.string().url(),
      env: schemaVaultsAppEnvironmentSchema,
      jti: z.string().uuid().optional(),
      iat: z.number().nonnegative(), // unix seconds (jose's setIssuedAt output)
      // Space-delimited granted OIDC scopes (RFC 6749 §3.3). Only set on
      // access tokens minted by the OIDC surface (audience `oidc-userinfo`),
      // where /api/oidc/userinfo uses it to filter the claims it returns.
      scope: z.string().max(256).optional(),
    })
    .required({
      uid: true,
      sub: true,
      email: true,
      email_verified: true,
      aud: true,
      app: true,
      admin: true,
      disabled: true,
      created_at: true,
      sig: true,
      iss: true,
      env: true,
      iat: true,
    })
    .strict()
    .refine((jwt_payload) => {
      return jwt_payload.sub === jwt_payload.uid;
    }, "Token subject does not match user ID")
    .refine((jwt_payload) => {
      if (jwt_payload.env === "production" || jwt_payload.env === "staging") {
        if (!jwt_payload.iss.startsWith("https://")) {
          return false;
        }
      }
      return true;
    }, "Issuer must use HTTPS in production or staging environments!");
}

export type CustomJWTPayload = zod.infer<
  ReturnType<typeof createJwtPayloadSchema>
>;
