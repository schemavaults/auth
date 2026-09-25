import type { ServerTraceRow } from "@/lib/auth-db/server-traces";
import type { OperationStats, TraceSummary } from "../trace-analytics";

/** What every dashboard tile renders from: one filtered sample, summarized once. */
export interface TraceTileProps {
  traces: readonly ServerTraceRow[];
  summary: TraceSummary;
  operations: readonly OperationStats[];
  /** Time window of the time-based charts (Unix epoch ms). */
  timeWindow: { from: number; to: number };
  /** Traces matching the filters in the window, when known (the sample may hold fewer). */
  matchingCount: number | null;
  /** No sample has loaded yet. */
  loading: boolean;
  /** A new sample is loading; the current one stays on screen. */
  refreshing: boolean;
  selectedOperations: readonly string[];
  selectedCategories: readonly string[];
  toggleOperation: (op_name: string) => void;
  toggleCategory: (op_category: string) => void;
}
