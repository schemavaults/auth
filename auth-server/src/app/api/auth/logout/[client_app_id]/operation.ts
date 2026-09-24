import "server-only";
import { toNextRequest } from "@/lib/api/next-request";
import { NextRequest } from "next/server";
import { appIdSchema } from "@schemavaults/app-definitions";
import { publicAccess, z, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { ErrorResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import handleLogout from "./handle_logout";

const ROUTE = "/api/auth/logout/{client_app_id}";

export const LogoutResponse = z
  .object({ success: z.literal(true), error: z.literal(false), message: z.string() })
  .openapi("LogoutResponse");

export const logout = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Log out of a client application",
  description:
    "Ends the browser's session with `client_app_id`: when the app's refresh token cookie is present and verifies, that refresh token and the access tokens minted with it are revoked server-side (other devices and other apps stay signed in), then the app's refresh token cookies are cleared. Browser callers (an `Origin` header is present) must come from an origin registered for the app and receive credentialed CORS headers; web apps must always send an `Origin`. Answer `OPTIONS` for the CORS preflight.",
  tags: [API_TAGS.authentication],
  auth: publicAccess(
    "Needs no credentials: an expired or missing refresh token still clears the cookies.",
  ),
  request: {
    params: z.object({
      client_app_id: withOpenApi(appIdSchema, { description: "Client application to log out of", example: "my-web-app" }),
    }),
  },
  responses: {
    200: { description: "The refresh token cookies were cleared", schema: LogoutResponse },
    ...validationErrorResponse,
    403: {
      description: "The `Origin` is not registered for the app, or a web app sent no `Origin`",
      schema: ErrorResponse,
    },
    404: { description: "No such app", schema: ErrorResponse },
    500: { description: "Failed to clear the cookies", schema: ErrorResponse },
  },
  handler: (ctx) => {
    const req: NextRequest =
      ctx.request instanceof NextRequest ? ctx.request : toNextRequest(ctx.request);
    return handleLogout(req, ctx.params.client_app_id);
  },
});
