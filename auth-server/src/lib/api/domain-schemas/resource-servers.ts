import { z } from "@schemavaults/openapi-operations";
import { BadRequestResponse, ErrorResponse } from "@/lib/api/schemas";

/**
 * Schemas shared by the operations of the "Resource servers" domain
 * (`/api/jwks/{audience}`, `/api/resource-server/**`): endpoints a resource
 * server calls on its own behalf, authenticated with a single-use JWKS
 * access assertion instead of a user session.
 */

/**
 * `{ success: false, error }`: the error envelope the resource-server
 * endpoints have always answered with (`error` carries the reason text,
 * there is no `message`). Kept for wire compatibility with deployed
 * `@schemavaults/auth-server-sdk` resource servers.
 */
export const ResourceServerErrorResponse = z
  .object({
    success: z.literal(false),
    error: z.string().openapi({ description: "Human readable reason", example: "Unauthorized" }),
  })
  .openapi("ResourceServerErrorResponse", {
    description: "Error envelope of the resource-server endpoints: `success` is false and `error` explains why.",
  });

/**
 * A JSON Web Key (RFC 7517 §4). Only the common members are listed; the
 * key material (`n`, `e`, `d`, ... for RSA keys) is present as well.
 */
export const JsonWebKey = z
  .object({
    kty: z.string().optional().openapi({ description: "Key type", example: "RSA" }),
    kid: z.string().optional().openapi({ description: "Key id, matched against the token header" }),
    alg: z.string().optional().openapi({ description: "Algorithm the key is meant for", example: "RS256" }),
    use: z.string().optional().openapi({ description: "`sig` (signature) or `enc` (encryption)", example: "sig" }),
  })
  .openapi("JsonWebKey", {
    description: "A JSON Web Key (RFC 7517 §4); carries the key material in addition to the members listed here.",
  });

/** A JSON Web Key Set (RFC 7517 §5). */
export const JsonWebKeySet = z
  .object({
    keys: z.array(JsonWebKey).readonly(),
  })
  .openapi("JsonWebKeySet", {
    description:
      "The keys the auth server uses for one API server audience: the RS256 signing keys and the JWE key-wrapping key.",
    example: {
      keys: [
        { kty: "RSA", kid: "0b6c4a1e-3f7a-4d0e-9b2a-7f3f2d1c8e5a", alg: "RS256", use: "sig", n: "...", e: "AQAB" },
      ],
    },
  });

/**
 * The 400 / 401 responses the JWKS access assertion resolver
 * (`src/lib/api/auth-resolvers/jwks-access-assertion.ts`) can produce.
 */
export const jwksAssertionErrorResponses = {
  400: {
    description:
      "The API server the assertion must be signed for (path parameter or `X-Api-Server-Id` header) is missing, malformed, or names the auth server itself; or the request failed validation",
    schema: z
      .union([BadRequestResponse, ResourceServerErrorResponse])
      .openapi("ResourceServerBadRequestResponse"),
  },
  401: {
    description:
      "No `Authorization: Bearer <assertion>` header was sent, or the assertion is malformed, expired, issued for another API server, not signed with the API server's active JWKS access key, or has already been used",
    schema: ErrorResponse,
  },
} as const;
