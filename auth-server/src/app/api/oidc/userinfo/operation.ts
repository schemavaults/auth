import { toNextRequest } from "@/lib/api/next-request";
import { z, publicAccess, type HttpMethod } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { noStoreHeaders, wwwAuthenticateHeaders } from "@/lib/api/domain-schemas/oidc";
import { API_TAGS } from "@/lib/api/tags";
import { handleOidcUserinfoRequest } from "./userinfo-handler";

const ROUTE = "/api/oidc/userinfo";

export const OidcUserinfoClaims = z
  .object({
    sub: z.string().openapi({
      description: "Subject identifier in the `<auth_server_app_id>|<uid>` form; always present and identical to the id_token's `sub`.",
      example: "schemavaults-auth|8f1c2d3e-...",
    }),
    email: z.string().optional().openapi({ description: "With the `email` scope." }),
    email_verified: z.boolean().optional().openapi({ description: "With the `email` scope." }),
    name: z.string().optional().openapi({ description: "With the `profile` scope, when set." }),
    given_name: z.string().optional(),
    middle_name: z.string().optional(),
    family_name: z.string().optional(),
    preferred_username: z.string().optional(),
  })
  .loose()
  .openapi("OidcUserinfoClaims", {
    description: "OIDC Core §5.3.2 claims, filtered by the access token's granted scope.",
  });

export const OidcUserinfoErrorResponse = z
  .object({
    error: z.enum(["invalid_request", "invalid_token", "insufficient_scope"]).openapi({
      description: "RFC 6750 §3.1 error code; the details are in the `WWW-Authenticate` challenge.",
    }),
  })
  .openapi("OidcUserinfoErrorResponse");

const DESCRIPTION =
  "The OpenID Connect userinfo endpoint (OIDC Core §5.3). Presents the access token issued by the token endpoint as `Authorization: Bearer <access_token>`; the server decrypts and verifies it (only tokens minted for the reserved `oidc-userinfo` audience are accepted) and returns the claims permitted by the token's granted scope: `sub` always, `email` / `email_verified` with the `email` scope, and the profile name claims (read fresh from the user's profile) with the `profile` scope. " +
  "Tokens from a plain OAuth 2.1 grant (no `openid` scope) are refused with 403 `insufficient_scope`. Served with `Access-Control-Allow-Origin: *` and `Cache-Control: no-store`. OIDC Core §5.3.1 allows POST as well as GET; form-body token delivery is not supported (the token must be in the `Authorization` header).";

function defineUserinfoOperation(method: Extract<HttpMethod, "get" | "post">) {
  return defineOperation({
    method,
    path: ROUTE,
    summary: method === "get" ? "Userinfo endpoint" : "Userinfo endpoint (POST)",
    description: DESCRIPTION,
    tags: [API_TAGS.oidc],
    auth: publicAccess(
      "Bearer access token minted by `POST /api/oidc/token` for the reserved `oidc-userinfo` audience (RFC 6750 §2.1). The handler verifies it itself; the platform's session cookies are not accepted here.",
    ),
    responses: {
      200: { description: "The claims the token's scope permits", schema: OidcUserinfoClaims, headers: noStoreHeaders },
      401: {
        description:
          "No `Authorization` header (`invalid_request`, challenge `Bearer`), or the bearer token is malformed, not a userinfo-audience token, expired, revoked or belongs to a disabled account (`invalid_token`)",
        schema: OidcUserinfoErrorResponse,
        headers: wwwAuthenticateHeaders,
      },
      403: {
        description: "The token is valid but was not granted the `openid` scope (`insufficient_scope`)",
        schema: OidcUserinfoErrorResponse,
        headers: wwwAuthenticateHeaders,
      },
    },
    handler: (ctx) => handleOidcUserinfoRequest(toNextRequest(ctx.request)),
  });
}

export const getOidcUserinfo = defineUserinfoOperation("get");
export const postOidcUserinfo = defineUserinfoOperation("post");
