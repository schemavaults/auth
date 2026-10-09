import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { API_TAGS } from "@/lib/api/tags";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";

export const AuthServerAppIdConfig = z
  .object({
    app_id: z.string().openapi({
      description:
        "This deployment's own app id (`SCHEMAVAULTS_AUTH_SERVER_APP_ID`, default `schemavaults-auth`). Resource servers set their own `SCHEMAVAULTS_AUTH_SERVER_APP_ID` to it.",
      example: "schemavaults-auth",
    }),
  })
  .openapi("AuthServerAppIdConfig");

/**
 * Public, unauthenticated endpoint exposing the auth server's own app id
 * (SCHEMAVAULTS_AUTH_SERVER_APP_ID). The id is not a secret: it is the
 * audience of first-party tokens, the suffix of the refresh-token cookie
 * name and the prefix of every OIDC `sub` claim. Resource servers and
 * scaffolding tools (e.g. `@schemavaults/init-next-app`) read it here to
 * configure themselves for a white-label deployment. Like
 * /api/config/branding it reads only environment variables, so it keeps
 * answering while the database or cache is down.
 */
export const getAppIdConfig = defineOperation({
  method: "get",
  path: "/api/config/app-id",
  summary: "Auth server app id",
  description:
    "The deployment's own app id, resolved from the `SCHEMAVAULTS_AUTH_SERVER_APP_ID` environment variable (default `schemavaults-auth`). Public. Resource servers targeting this deployment set their own `SCHEMAVAULTS_AUTH_SERVER_APP_ID` to this value. Reads no database or cache.",
  tags: [API_TAGS.configuration],
  auth: publicAccess(),
  responses: {
    200: {
      description: "The auth server's app id",
      schema: z
        .object({
          error: z.literal(false),
          success: z.literal(true),
          message: z.string(),
          data: AuthServerAppIdConfig,
        })
        .openapi("AppIdConfigResponse"),
    },
  },
  handler: (ctx) =>
    ctx.json(200, {
      error: false,
      success: true,
      message: "Successfully loaded the auth server app id!",
      data: { app_id: getAuthServerAppId() },
    }),
});
