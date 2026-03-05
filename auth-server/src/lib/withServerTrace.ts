import "server-only";
import { serverTraceSchema, type ServerTrace, type ServerTraceOpCategory } from "@/lib/auth-db/server-traces";
import { ServerlessDatabase } from "@/lib/auth-db";

async function defaultWriteToSink(trace: ServerTrace): Promise<void> {
  await using dbh = ServerlessDatabase.createDBH();
  await dbh.db.insertInto("server_traces").values(trace).execute();
}

export async function withServerTrace<T>(opts: {
  op_name: string;
  op_category: ServerTraceOpCategory;
  event_id: string;
  callback: () => Promise<T>;
  writeToSink?: (trace: ServerTrace) => Promise<void>;
}): Promise<T> {
  const start_time = Date.now();
  const result: Awaited<T> = await opts.callback();
  const end_time = Date.now();

  try {
    const parsed_trace = await serverTraceSchema.safeParseAsync({
      event_id: opts.event_id,
      op_name: opts.op_name,
      op_category: opts.op_category,
      start_time,
      end_time,
    });
    if (!parsed_trace.success) {
      console.error("withServerTrace failed to prepare a valid trace object:", parsed_trace.error);
      return result;
    }
    const trace: ServerTrace = parsed_trace.data;

    const writeToSink = opts.writeToSink ?? defaultWriteToSink;
    await writeToSink(trace);
  } catch (e: unknown) {
    console.error("withServerTrace failed to write trace to sink:", e);
  }

  return result;
}
