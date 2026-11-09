import type { z as zod } from "zod";
import {
  apiServerIdSchema,
  appIdSchema,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
} from "@schemavaults/app-definitions";
import { createAudienceSchema, MAX_OIDC_SCOPE_LENGTH } from "@schemavaults/auth-common";
import { createJwtActorClaimSchema } from "./actor-claim";

// Data to hold in the JWT
export function createJwtPayloadSchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
) {
  return z
    .object({
      uid: z.guid(),
      sub: z.guid(),
      email: z.email(),
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
      iss: z.url(),
      env: schemaVaultsAppEnvironmentSchema,
      jti: z.guid().optional(),
      iat: z.number().nonnegative(), // unix seconds (jose's setIssuedAt output)
      // Unix seconds. Every token carries it and decryption verifies it
      // (jose), and decodeJWT() returns it since 0.17.0 because a token may
      // expire before iat + its type's lifetime (a delegated token never
      // outlives the token it was exchanged for). Optional here so payloads
      // built by hand (tests, fixtures) need not carry it; decoders before
      // 0.17.0 strip it before validating, so the strict schema is unaffected.
      exp: z.number().nonnegative().optional(),
      // Space-delimited granted scopes (RFC 6749 §3.3). Set on every
      // access/refresh token issued since scopes became first-class;
      // kept optional so tokens issued before then remain decodable
      // until they expire. /api/oidc/userinfo filters its claims by it
      // and route guards enforce `required_scopes` against it. Bounded
      // like the `scope` request parameter it was granted from (it never
      // holds more than was asked for). Decoders before 0.17.2 capped it
      // at 256 characters and reject a token carrying a longer one.
      scope: z.string().max(MAX_OIDC_SCOPE_LENGTH).optional(),
      // REFRESH tokens only: the API server whose API scopes `scope`
      // carries (granted for an RFC 8707 `resource` naming it). The OIDC
      // refresh grant stamps those scopes only on access tokens minted for
      // that API server. Omitted when the grant holds no API scopes, so
      // tokens without API scopes stay decodable by older decoders.
      scope_api_server_id: apiServerIdSchema.optional(),
      // True on tokens minted for a client application's service account
      // (OAuth2 client_credentials grant, RFC 6749 §4.4): the subject is a
      // machine identity, not a person. Omitted on every other token.
      service_account: z.boolean().optional(),
      // ACCESS tokens only: the RFC 8693 §4.1 actor, who acts on behalf of
      // `sub` (e.g. an agent acting for the user); see actor-claim.ts.
      // The outermost `act` is the current actor; nested ones are prior
      // actors and informational only: access-control decisions MUST use
      // only the top-level claims and the current actor. Protected by the
      // JWE like `scope`; the inner `sig` does not cover it. Decoders
      // before this claim reject it (this schema is strict), so the auth
      // server may only send it to resource servers running a version that
      // accepts it: the change that starts emitting it must gate emission
      // per API server. Nothing emits it yet.
      act: createJwtActorClaimSchema(z).optional(),
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
