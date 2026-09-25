import type { ServerTraceOpCategory } from "@/lib/server-trace-schema";

/**
 * Chart colors of the trace dashboard, set as CSS custom properties on its
 * root so light and dark mode each get their own validated steps.
 *
 * Slots 1–4 of the data-viz reference palette (blue, orange, aqua, yellow),
 * validated in this order against the card surfaces (`#ffffff` light,
 * `#020817` dark): worst adjacent CVD ΔE 9.1 light / 8.4 dark, normal-vision
 * ΔE ≥ 19.8. Aqua and yellow sit below 3:1 on the light surface, so every
 * colored mark ships with a legend or labels and a table view. "Other" is the
 * de-emphasis gray for categories this build does not know.
 */
export const TRACE_CHART_COLOR_VARIABLES: string = [
  "[--trace-series-1:#2a78d6] dark:[--trace-series-1:#3987e5]",
  "[--trace-series-2:#eb6834] dark:[--trace-series-2:#d95926]",
  "[--trace-series-3:#1baf7a] dark:[--trace-series-3:#199e70]",
  "[--trace-series-4:#eda100] dark:[--trace-series-4:#c98500]",
  "[--trace-series-other:#898781]",
].join(" ");

/** The single-series mark color (slot 1). */
export const TRACE_ACCENT_COLOR: string = "var(--trace-series-1)";

/** The de-emphasis gray: folded tails and unknown categories. */
export const TRACE_OTHER_COLOR: string = "var(--trace-series-other)";

/**
 * Categories in color-slot order. The mapping is fixed per category (color
 * follows the entity), so filtering never repaints the survivors;
 * `subroutine`, the category most traces carry, takes the leading slot.
 */
export const TRACE_CATEGORY_ORDER: readonly ServerTraceOpCategory[] = [
  "subroutine",
  "database_query",
  "http_request",
  "http_response",
];

const CATEGORY_COLORS: Record<ServerTraceOpCategory, string> = {
  subroutine: "var(--trace-series-1)",
  database_query: "var(--trace-series-2)",
  http_request: "var(--trace-series-3)",
  http_response: "var(--trace-series-4)",
};

const CATEGORY_LABELS: Record<ServerTraceOpCategory, string> = {
  subroutine: "Subroutine",
  database_query: "Database query",
  http_request: "HTTP request",
  http_response: "HTTP response",
};

function isKnownCategory(category: string): category is ServerTraceOpCategory {
  return (TRACE_CATEGORY_ORDER as readonly string[]).includes(category);
}

export function getTraceCategoryColor(category: string): string {
  return isKnownCategory(category)
    ? CATEGORY_COLORS[category]
    : TRACE_OTHER_COLOR;
}

export function getTraceCategoryLabel(category: string): string {
  return isKnownCategory(category) ? CATEGORY_LABELS[category] : category;
}
