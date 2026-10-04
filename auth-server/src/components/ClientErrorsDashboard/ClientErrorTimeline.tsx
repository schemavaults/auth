"use client";

import { useMemo, type ReactElement } from "react";
import {
  BarChart,
  type BarChartBar,
  type BarChartTooltipContext,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@schemavaults/ui";
import type { ClientErrorStats } from "@/lib/auth-db/client-errors";
import { describeBucketWidth, formatTimelineBucket, formatTimelineStart, pluralize } from "./format";

export interface ClientErrorTimelineProps {
  stats: ClientErrorStats;
  loading: boolean;
}

/** Error counts over the dashboard's time range. */
export function ClientErrorTimeline({ stats, loading }: ClientErrorTimelineProps): ReactElement {
  const { window, timeline } = stats;
  const bars: BarChartBar[] = useMemo(
    (): BarChartBar[] =>
      timeline.map(
        (bucket): BarChartBar => ({
          id: String(bucket.start),
          value: bucket.count,
          label: formatTimelineBucket(bucket.start, window.bucket_ms),
          color: "destructive",
        }),
      ),
    [timeline, window.bucket_ms],
  );

  return (
    <Card className="min-w-0 lg:col-span-2" data-testid="client-errors-timeline">
      <CardHeader>
        <CardTitle className="text-base">Errors over time</CardTitle>
        <CardDescription>
          Reports received per {describeBucketWidth(window.bucket_ms)}
          {timeline.length > 0
            ? `, from ${formatTimelineStart(timeline[0]!.start, window.bucket_ms)} to now.`
            : "."}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {stats.totals.errors === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">No client errors in this view.</p>
        ) : (
          <BarChart
            bars={bars}
            label="Client errors over time"
            width="auto"
            height={200}
            barGap={0.2}
            maxBarThickness={Infinity}
            showCategoryLabels={false}
            showValueAxis
            loading={loading}
            formatTooltip={(context: BarChartTooltipContext): ReactElement => (
              <span>
                <span className="font-medium">{context.bar.label}</span>
                <br />
                {pluralize(context.value, "error")}
              </span>
            )}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default ClientErrorTimeline;
