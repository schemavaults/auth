import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { AdminServerTrace } from "@/lib/api/domain-schemas/admin";
import { adminErrorResponses, ErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";
import captureServerException from "@/lib/captureServerException";
import { type ServerTrace, serverTraceSchema } from "@/lib/server-trace-schema";

const ROUTE = "/api/admin/server-traces";

function toNumber(value: unknown): number {
  return typeof value === "string" ? parseInt(value, 10) : Number(value);
}

export const listServerTraces = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List recent server traces",
  description: "Returns the 200 most recent timing traces (database queries, HTTP calls, subroutines) captured by the server, newest first.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  responses: {
    200: {
      description: "The most recent traces",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ traces: z.array(AdminServerTrace).readonly() }),
      }),
    },
    ...adminErrorResponses,
    500: { description: "Failed to list server traces", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;

    let rawTraces: readonly ServerTraceRow[];
    try {
      rawTraces = await db
        .selectFrom("server_traces")
        .selectAll()
        .orderBy("start_time", "desc")
        .limit(200)
        .execute();
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_server_traces_handler.listServerTraces",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list server traces!" });
    }

    // Postgres BIGINT columns come back from the driver as strings to preserve
    // 64-bit precision. start_time/end_time are ms epoch timestamps that fit
    // safely in Number, so coerce them here before returning JSON.
    const normalized = rawTraces.map((row) => ({
      ...row,
      start_time: toNumber(row.start_time),
      end_time: toNumber(row.end_time),
    }));

    const parsed = z.array(serverTraceSchema).safeParse(normalized);
    if (!parsed.success) {
      await captureServerException(db, parsed.error, {
        op_name: "GET_list_server_traces_handler.parseServerTraces",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list server traces!" });
    }
    const traces: readonly ServerTrace[] = parsed.data;

    return ctx.json(200, {
      success: true,
      message: "Successfully listed server traces!",
      data: { traces },
    });
  },
});
