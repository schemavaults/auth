import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { AdminServerTrace, serverTraceSinceParamSchema } from "@/lib/api/domain-schemas/admin";
import {
  adminErrorResponses,
  ErrorResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { listServerTraces as listServerTraceRows, type ServerTraceRow } from "@/lib/auth-db/server-traces";
import captureServerException from "@/lib/captureServerException";
import {
  SERVER_TRACES_DEFAULT_LIMIT,
  SERVER_TRACES_MAX_LIMIT,
} from "@/lib/server-trace-filters";
import {
  type ServerTrace,
  serverTraceOpCategories,
  serverTraceSchema,
} from "@/lib/server-trace-schema";

const ROUTE = "/api/admin/server-traces";

/** Most values a repeatable filter parameter accepts. */
const MAX_FILTER_VALUES: number = 100;

const opCategorySchema = z.enum(serverTraceOpCategories);

const limitParamSchema = z
  .string()
  .min(1)
  .pipe(z.coerce.number<string>().int().min(1).max(SERVER_TRACES_MAX_LIMIT))
  .openapi({
    description: `How many of the most recent matching traces to return (1–${SERVER_TRACES_MAX_LIMIT}, default ${SERVER_TRACES_DEFAULT_LIMIT}).`,
    example: "1000",
  });

const opNameParamSchema = z
  .union([z.string().min(1), z.array(z.string().min(1)).max(MAX_FILTER_VALUES)])
  .openapi({
    description: "Only traces of this operation. Repeat the parameter to keep several operations.",
    example: "POST /api/auth/login",
  });

const opCategoryParamSchema = z
  .union([opCategorySchema, z.array(opCategorySchema).max(serverTraceOpCategories.length)])
  .openapi({
    description: "Only traces of this category. Repeat the parameter to keep several categories.",
    example: "subroutine",
  });

function toArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value as T];
}

export const listServerTraces = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List recent server traces",
  description:
    `Returns the most recent timing traces (database queries, HTTP calls, subroutines) captured by the server, newest first: ${SERVER_TRACES_DEFAULT_LIMIT} by default, up to ${SERVER_TRACES_MAX_LIMIT} with \`limit\`. ` +
    "`since`, `op_name` and `op_category` narrow the listing before the limit applies.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    query: z.object({
      limit: limitParamSchema.optional(),
      since: serverTraceSinceParamSchema.optional(),
      op_name: opNameParamSchema.optional(),
      op_category: opCategoryParamSchema.optional(),
    }),
  },
  responses: {
    200: {
      description: "The most recent matching traces",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ traces: z.array(AdminServerTrace).readonly() }),
      }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    500: { description: "Failed to list server traces", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { limit, since, op_name, op_category } = ctx.query;

    let rawTraces: readonly ServerTraceRow[];
    try {
      rawTraces = await listServerTraceRows(db, {
        limit: limit ?? SERVER_TRACES_DEFAULT_LIMIT,
        since_ms: since,
        op_names: toArray(op_name),
        op_categories: toArray(op_category),
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_server_traces_handler.listServerTraces",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list server traces!" });
    }

    const parsed = z.array(serverTraceSchema).safeParse(rawTraces);
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
