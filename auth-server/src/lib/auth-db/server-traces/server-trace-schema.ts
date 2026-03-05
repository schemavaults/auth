import { z } from "zod";

export const serverTraceOpCategories = [
  "database_query",
  "http_response",
  "http_request",
  "subroutine",
] as const;

export type ServerTraceOpCategory = (typeof serverTraceOpCategories)[number];

export const serverTraceSchema = z.object({
  event_id: z.string().uuid(),
  op_name: z.string().min(1),
  op_category: z.enum(serverTraceOpCategories),
  start_time: z.number().nonnegative(),
  end_time: z.number().nonnegative(),
}).strict();

export type ServerTrace = z.infer<typeof serverTraceSchema>;
