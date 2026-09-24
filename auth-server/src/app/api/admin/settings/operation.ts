import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { adminErrorResponses, ErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { ServerSettingsRegistry, type ServerSettingRecord } from "@/lib/auth-db/server-settings";
import captureServerException from "@/lib/captureServerException";

export const ServerSettingRecordSchema = z
  .object({
    key: z.string().openapi({ example: "invite_codes_required" }),
    value: z.unknown().openapi({ description: "The setting's current value (type depends on the key)" }),
    valueType: z.string().openapi({ example: "boolean" }),
    description: z.string().nullable(),
    updatedAt: z.number().openapi({ description: "Unix epoch milliseconds" }),
    updatedBy: z.string().nullable().openapi({ description: "uid of the administrator who last changed it" }),
  })
  .openapi("ServerSettingRecord");

export const listServerSettings = defineOperation({
  method: "get",
  path: "/api/admin/settings",
  summary: "List server settings",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  responses: {
    200: {
      description: "Every server setting with its current value",
      schema: z.object({
        success: z.literal(true),
        data: z.object({ settings: z.array(ServerSettingRecordSchema).readonly() }),
      }),
    },
    ...adminErrorResponses,
    500: { description: "Failed to list server settings", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, redis } = ctx.context;
    let settings: ServerSettingRecord[];
    try {
      settings = await new ServerSettingsRegistry(db, undefined, redis.client).listAllSettings();
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_settings.listAllSettings",
        route: "/api/admin/settings",
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list server settings" });
    }
    return ctx.json(200, { success: true, data: { settings } });
  },
});
