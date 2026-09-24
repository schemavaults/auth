import { z } from "@schemavaults/openapi-operations";

/**
 * Schemas shared by the standards-facing OpenID Connect / OAuth 2.0
 * operations (`src/app/api/oidc/**`). Their wire formats are mandated by
 * the specifications, so none of them use the management API's
 * `{ success, message }` envelope.
 */

/** Media type of the token / introspection request bodies (RFC 6749 §3.2). */
export const OAUTH_FORM_CONTENT_TYPE = "application/x-www-form-urlencoded" as const;

/** RFC 6749 §5.2 / RFC 7591 §3.2.2 style error body: `{ error, error_description? }`. */
export const OAuthErrorResponse = z
  .object({
    error: z.string().openapi({
      description:
        "OAuth 2.0 error code, e.g. `invalid_request`, `invalid_client`, `invalid_grant`, `unauthorized_client`, `unsupported_grant_type`, `invalid_scope`, `invalid_target`, `access_denied`, `server_error`.",
      example: "invalid_request",
    }),
    error_description: z
      .string()
      .optional()
      .openapi({ description: "Human readable explanation of the error." }),
  })
  .openapi("OAuthErrorResponse", {
    description:
      "OAuth 2.0 error response (RFC 6749 §5.2). Carries `Cache-Control: no-store` and `Pragma: no-cache`.",
  });

/** Documents the `WWW-Authenticate` challenge on 401 responses (RFC 6750 §3 / RFC 6749 §5.2). */
export const wwwAuthenticateHeaders = z.object({
  "WWW-Authenticate": z.string().openapi({
    description: "The authentication challenge, e.g. `Bearer error=\"invalid_token\"` or `Basic realm=\"...\"`.",
  }),
});

/** Documents the `Cache-Control: no-store` header OAuth responses carry. */
export const noStoreHeaders = z.object({
  "Cache-Control": z.string().openapi({ example: "no-store" }),
});
