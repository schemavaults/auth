import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { adminErrorResponses, ErrorResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  ServerSettingsRegistry,
  isValidServerSettingKey,
  getSettingSchema,
  type ServerSettingKey,
} from "@/lib/auth-db/server-settings";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/settings/{key}";

export const updateServerSetting = defineOperation({
  method: "patch",
  path: ROUTE,
  summary: "Update a server setting",
  description:
    "Sets the value of one server setting. The value is validated against the setting's own schema (boolean, string, ...).",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    params: z.object({ key: z.string().openapi({ example: "invite_codes_required" }) }),
    body: {
      lenientContentType: true,
      schema: z
        .object({
          value: z.unknown().openapi({ description: "New value; validated against the setting's own schema" }),
          description: z.string().optional(),
        })
        .refine((body) => body.value !== undefined, "Missing 'value' field in request body")
        .openapi("UpdateServerSettingRequest"),
    },
  },
  responses: {
    200: {
      description: "The updated setting",
      schema: z.object({
        success: z.literal(true),
        data: z.object({ key: z.string(), value: z.unknown() }),
      }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    500: { description: "Failed to update the setting", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, redis } = ctx.context;
    const { key } = ctx.params;

    if (!isValidServerSettingKey(key)) {
      return ctx.json(400, { success: false, message: `Invalid setting key: ${key}` });
    }
    const typedKey = key as ServerSettingKey;
    const parseResult = getSettingSchema(typedKey).safeParse(ctx.body.value);
    if (!parseResult.success) {
      return ctx.json(400, {
        success: false,
        message: `Invalid value for setting "${key}": ${parseResult.error.message}`,
      });
    }

    try {
      await new ServerSettingsRegistry(db, undefined, redis.client).setSetting(
        typedKey,
        parseResult.data,
        user.uid,
        ctx.body.description,
      );
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "PATCH_update_setting.setSetting",
        route: ROUTE,
        uid: user.uid,
        context: { key },
      });
      return ctx.json(500, { success: false, message: `Failed to update setting "${key}"` });
    }
    return ctx.json(200, { success: true, data: { key, value: parseResult.data } });
  },
});
