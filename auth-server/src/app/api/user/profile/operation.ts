import {
  updateUserProfileRequestSchema,
  userProfileResponseSchema,
  type UserProfileNames,
  type UserProfileResponse,
} from "@schemavaults/auth-common";
import { requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { UserRegistry, UsernameTakenError, UserNotFoundError, type UserDocument } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/profile";

const UserProfileResponseSchema = withOpenApi(userProfileResponseSchema, "UserProfileResponse", {
  description: "The caller's profile name fields; absent fields are unset.",
});

function toProfileNames(user: UserDocument): UserProfileNames {
  return {
    ...(user.username !== undefined ? { username: user.username } : {}),
    ...(user.first_name !== undefined ? { first_name: user.first_name } : {}),
    ...(user.middle_name !== undefined ? { middle_name: user.middle_name } : {}),
    ...(user.last_name !== undefined ? { last_name: user.last_name } : {}),
    ...(user.display_name !== undefined ? { display_name: user.display_name } : {}),
  };
}

/** The strict `{ success, profile }` payload, or null when it fails to serialize. */
function serializeProfile(user: UserDocument): UserProfileResponse | null {
  const payload: UserProfileResponse = { success: true, profile: toProfileNames(user) };
  const parsed = userProfileResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

const SERIALIZE_FAILURE = { success: false, message: "Failed to serialize user profile" } as const;

export const getUserProfile = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get my profile",
  description:
    "Returns the caller's profile name fields (username, first/middle/last name, display name), read fresh from the database: the auth token payload does not carry them.",
  tags: [API_TAGS.account],
  auth: requireAuth({ schemes: sessionSchemes }),
  responses: {
    200: { description: "The caller's profile", schema: UserProfileResponseSchema },
    ...sessionErrorResponses,
    404: { description: "The caller's account no longer exists", schema: ErrorResponse },
    500: { description: "Failed to load the profile", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    try {
      const userDoc = await new UserRegistry(db).getUserByUID(user.uid);
      if (!userDoc) return ctx.json(404, { success: false, message: "User not found" });
      const payload = serializeProfile(userDoc);
      return payload ? ctx.json(200, payload) : ctx.json(500, SERIALIZE_FAILURE);
    } catch (e: unknown) {
      await captureServerException(db, e, { op_name: "GET_profile_handler", route: ROUTE, uid: user.uid });
      return ctx.json(500, { success: false, message: "Failed to load user profile" });
    }
  },
});

export const updateUserProfile = defineOperation({
  method: "put",
  path: ROUTE,
  summary: "Replace my profile",
  description:
    "Replaces the caller's profile name fields. Full-replacement semantics: fields that are omitted or set to null are cleared. Unknown fields are rejected.",
  tags: [API_TAGS.account],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    body: {
      lenientContentType: true,
      schema: withOpenApi(updateUserProfileRequestSchema, "UpdateUserProfileRequest", {
        description: "The new profile name fields; omitted or null fields are cleared.",
      }),
    },
  },
  responses: {
    200: { description: "The updated profile", schema: UserProfileResponseSchema },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "The caller's account no longer exists", schema: ErrorResponse },
    409: { description: "The requested username is already taken", schema: ErrorResponse },
    500: { description: "Failed to update the profile", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    try {
      const updated = await new UserRegistry(db).updateUserProfile(user.uid, ctx.body);
      const payload = serializeProfile(updated);
      return payload ? ctx.json(200, payload) : ctx.json(500, SERIALIZE_FAILURE);
    } catch (e: unknown) {
      if (e instanceof UsernameTakenError) {
        return ctx.json(409, { success: false, message: "That username is already taken." });
      }
      if (e instanceof UserNotFoundError) {
        return ctx.json(404, { success: false, message: "User not found" });
      }
      await captureServerException(db, e, { op_name: "PUT_profile_handler", route: ROUTE, uid: user.uid });
      return ctx.json(500, { success: false, message: "Failed to update user profile" });
    }
  },
});
