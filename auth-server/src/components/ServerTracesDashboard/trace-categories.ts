import { CHART_OTHER_COLOR, CHART_SERIES_COLORS } from "@schemavaults/ui";
import type { ServerTraceOpCategory } from "@/lib/server-trace-schema";

/**
 * Categories in color-slot order of the `@schemavaults/theme` chart palette
 * (`--chart-1` …). The mapping is fixed per category (color follows the
 * entity), so filtering never repaints the survivors; `subroutine`, the
 * category most traces carry, takes the leading slot. Categories this build
 * does not know get the de-emphasis grey (`--chart-other`).
 */
export const TRACE_CATEGORY_ORDER: readonly ServerTraceOpCategory[] = [
  "subroutine",
  "database_query",
  "http_request",
  "http_response",
];

const CATEGORY_LABELS: Record<ServerTraceOpCategory, string> = {
  subroutine: "Subroutine",
  database_query: "Database query",
  http_request: "HTTP request",
  http_response: "HTTP response",
};

function isKnownCategory(category: string): category is ServerTraceOpCategory {
  return (TRACE_CATEGORY_ORDER as readonly string[]).includes(category);
}

/** The category's chart color as a CSS value (segment fills and legend swatches). */
export function getTraceCategoryColor(category: string): string {
  const slot: number = (TRACE_CATEGORY_ORDER as readonly string[]).indexOf(category);
  return slot >= 0 ? (CHART_SERIES_COLORS[slot] ?? CHART_OTHER_COLOR) : CHART_OTHER_COLOR;
}

export function getTraceCategoryLabel(category: string): string {
  return isKnownCategory(category) ? CATEGORY_LABELS[category] : category;
}
