import { z } from "zod";

export const serverTraceSchema = z.object({
  event_id: z.string(),
  op_name: z.string(),
  op_category: z.string(),
  start_time: z.number().nonnegative(),
  end_time: z.number().nonnegative(),
}).strict();

export type ServerTrace = z.infer<typeof serverTraceSchema>;
