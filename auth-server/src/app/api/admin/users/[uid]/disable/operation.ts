import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import type { GuardedOperationContext } from "@/lib/api/legacy-route-props";
import {
  adminErrorResponses,
  ErrorResponse,
  ResourceCreationResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { UserNotFoundError, UserRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { invalidateUserTokensValidAfterCache } from "@/lib/token-revocation";

const ROUTE = "/api/admin/users/{uid}/disable";

const request = {
  params: z.object({ uid: z.guid().openapi({ description: "uid of the target user" }) }),
} as const;

const responses = {
  200: { description: "The user's disabled state was updated", schema: ResourceCreationResponse },
  ...validationErrorResponse,
  ...adminErrorResponses,
  404: { description: "No such user", schema: ErrorResponse },
  500: { description: "Failed to update the user", schema: ErrorResponse },
} as const;

interface SetDisabledContext extends GuardedOperationContext {
  readonly params: { readonly uid: string };
  readonly json: (
    status: 200 | 400 | 404 | 500,
    body: { success: true; message: string; resource_id: string } | { success: false; message: string },
  ) => Response;
}

async function setDisabled(ctx: SetDisabledContext, disabled: boolean): Promise<Response> {
  const user = ctx.auth.user;
  const { db } = ctx.context;
  const target_uid = ctx.params.uid;

  if (user.uid === target_uid) {
    return ctx.json(400, { success: false, message: "You cannot change your own disabled state." });
  }

  try {
    await new UserRegistry(db).setUserDisabled(target_uid, disabled);
  } catch (e: unknown) {
    if (e instanceof UserNotFoundError) {
      return ctx.json(404, { success: false, message: "User not found" });
    }
    await captureServerException(db, e, {
      op_name: "setDisabledHandler.setUserDisabled",
      route: "/api/admin/users/[uid]/disable",
      uid: user.uid,
      context: { target_uid, disabled },
    });
    return ctx.json(500, { success: false, message: `Failed to ${disabled ? "disable" : "enable"} user` });
  }

  // setUserDisabled moved the target's tokens_valid_after watermark; drop
  // the route guards' cached copy so the revocation applies immediately,
  // not after the cache TTL. Best effort: a Redis outage only delays
  // enforcement by that TTL.
  try {
    await invalidateUserTokensValidAfterCache(ctx.context.redis, target_uid);
  } catch (e: unknown) {
    console.warn(
      `[setDisabled] Could not invalidate the cached tokens_valid_after watermark for uid '${target_uid}': `,
      e,
    );
  }

  return ctx.json(200, {
    success: true,
    message: `Successfully ${disabled ? "disabled" : "enabled"} user`,
    resource_id: target_uid,
  });
}

export const disableUser = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Disable a user",
  description:
    "Marks the account disabled and revokes every session and token it holds (the user's `tokens_valid_after` watermark is pinned while the account stays disabled), so it can no longer log in or use an existing session. Administrators cannot disable themselves.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request,
  responses,
  handler: (ctx) => setDisabled(ctx, true),
});

export const enableUser = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Re-enable a user",
  description:
    "Clears the disabled flag set by `POST /api/admin/users/{uid}/disable`. Sessions revoked by the disable stay revoked: the user has to log in again.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request,
  responses,
  handler: (ctx) => setDisabled(ctx, false),
});
