import "server-only";
import { appIdSchema } from "@schemavaults/app-definitions";
import { userDataSchema, type UserData } from "@schemavaults/auth-common";
import { requireAuth, z, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { clientAppSessionCookieScheme, sessionSchemes } from "@/lib/api/auth-schemes";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { UserRegistry, loadUserData } from "@/lib/auth-db";

const ROUTE = "/api/auth/whoami/{client_app_id}";

export const whoami = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get the signed-in user",
  description:
    "Returns the complete, current `UserData` of the caller (reloaded from the database rather than taken from the token's claims). Besides the auth server's own session and access tokens it accepts the per-client-app refresh token cookie issued to `client_app_id` during the OAuth2 grant, so SDK clients can sync their current user without an auth server session. Browser callers from an origin registered for the app receive credentialed CORS headers on every response (401 included); an authenticated request from an unregistered origin is refused with 403. Answer `OPTIONS` for the CORS preflight.",
  tags: [API_TAGS.authentication],
  auth: requireAuth({
    schemes: [clientAppSessionCookieScheme, ...sessionSchemes],
    notes:
      "Credentials are checked before the path parameter, so an unauthenticated caller always gets 401 whatever `client_app_id` it sent.",
  }),
  request: {
    params: z.object({
      client_app_id: withOpenApi(appIdSchema, {
        description: "Client application whose session the caller holds",
        example: "my-web-app",
      }),
    }),
  },
  responses: {
    200: {
      description: "The caller's user data",
      schema: z.object({ success: z.literal(true), user: userDataSchema }),
    },
    ...validationErrorResponse,
    401: sessionErrorResponses[401],
    403: {
      description:
        "The account is disabled, or the request is authenticated but comes from an origin not registered for the app",
      schema: ErrorResponse,
    },
    500: { description: "Failed to load the user", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user_from_token = ctx.auth.user!;
    const { db, debug } = ctx.context;
    const { client_app_id } = ctx.params;

    if (debug) {
      console.log(`GET => /api/auth/whoami/${client_app_id}`);
    }

    // The principal's `user` is derived from the presented token's claims.
    // Reload the row so callers — notably the client SDK, which syncs
    // `currentUser` from this endpoint after every login and token
    // refresh — get the complete, current UserData (profile names,
    // invite code, email_verified, ...) rather than a claims snapshot
    // frozen at token issuance.
    let user: UserData;
    try {
      user = await loadUserData(user_from_token.uid, new UserRegistry(db, debug));
    } catch (e: unknown) {
      console.error(
        `[/api/auth/whoami/${client_app_id}] Failed to load user data for uid '${user_from_token.uid}':`,
        e,
      );
      return ctx.json(500, { success: false, error: true, message: "Internal server error" });
    }

    // Validate that user object contains only UserData fields.
    // userDataSchema is .strict(), so this returns an error if JWT-internal fields leaked through.
    const parseResult = await userDataSchema.safeParseAsync(user);
    if (!parseResult.success) {
      console.error(`[/api/auth/whoami/${client_app_id}] User object failed validation:`, parseResult.error);
      return ctx.json(500, { success: false, error: true, message: "Internal server error" });
    }

    const validatedUser = parseResult.data;
    if (debug) {
      console.log(
        `[/api/auth/whoami/${client_app_id}] Returning user details for '${validatedUser.email}' (uid: '${validatedUser.uid}')`,
      );
    }
    return ctx.json(200, { success: true, user: validatedUser });
  },
});
