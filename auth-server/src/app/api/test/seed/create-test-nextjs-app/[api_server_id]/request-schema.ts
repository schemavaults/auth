import { apiServerIdSchema, resourceUrlMatchModeSchema } from "@schemavaults/app-definitions";
import { z } from "@schemavaults/openapi-operations";

/** JSON body of `POST /api/test/seed/create-test-nextjs-app/{api_server_id}` (strict: unknown keys are refused). */
export const CreateTestNextjsAppRequest = z
  .object({
    url: z.url().openapi({
      description: "Origin of the example resource server; registered as the app's and the API server's domain",
      example: "http://localhost:3000",
    }),
    jwks_access_public_key: z.string().min(64).openapi({
      description: "PEM public key the resource server proves JWKS access with (stored as its active JWKS access key)",
    }),
    // Optional confidential-client seeding: when set, the plaintext secret
    // is hashed and stored so the seeded app requires client
    // authentication at the token endpoints.
    client_secret: z.string().min(16).max(256).optional().openapi({
      description: "Plaintext client secret to register, making the seeded app a confidential client",
    }),
    // Optional explicit redirect-URI allowlist for the seeded app; when
    // non-empty, redirect_uri validation for the test environment requires
    // an exact match against these URLs instead of any path on `url`.
    callback_urls: z.array(z.url()).max(50).optional().openapi({
      description: "Explicit redirect_uri allowlist; while empty any path on `url` is accepted",
    }),
    // Optional extra API servers (already seeded) to connect the new app
    // to, so it may request `resource` tokens for them — e.g. a
    // confidential client obtaining client_credentials tokens for the
    // example resource server's API.
    connect_to_api_server_ids: z.array(apiServerIdSchema).max(10).optional().openapi({
      description: "Already seeded API servers to connect the new app to (for RFC 8707 `resource` tokens)",
    }),
    // Optional dynamic-client policy for the seeded API server: whether
    // RFC 7591 dynamically registered clients may request `resource`
    // tokens for it without a connection, and how a resource URL is
    // matched against its domain (`exact` | `prefix`).
    allow_dynamic_clients: z.boolean().optional(),
    resource_url_match_mode: resourceUrlMatchModeSchema.optional(),
  })
  .required({
    url: true,
    jwks_access_public_key: true,
  })
  .strict()
  .openapi("CreateTestNextjsAppRequest");
