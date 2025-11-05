import { z } from "zod";
import { REFRESH_TOKEN_AUDIENCE } from "./aud";
import {
  appIdSchema,
  schemaVaultsAppEnvironmentSchema,
} from "@schemavaults/app-definitions";
import { audienceRefSchema, organizationIdSchema } from "@schemavaults/auth";

// Data to hold in the JWT
export const jwtPayloadSchema = z
  .object({
    uid: z.string().uuid(),
    sub: z.string().uuid(),
    email: z.string().email(),
    email_verified: z.boolean(),
    aud: audienceRefSchema, // Backend resource API UUID, either auth server url or a registered api server's unique UUID
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
    iss: z.literal(REFRESH_TOKEN_AUDIENCE),
    env: schemaVaultsAppEnvironmentSchema,
    orgs: organizationIdSchema.array().readonly(),
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
    orgs: true,
  })
  .strict()
  .refine((jwt_payload) => {
    return jwt_payload.sub === jwt_payload.uid;
  }, "Token subject does not match user ID");

export type CustomJWTPayload = z.infer<typeof jwtPayloadSchema>;
