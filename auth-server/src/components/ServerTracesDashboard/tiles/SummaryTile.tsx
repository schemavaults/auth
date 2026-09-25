"use client";

import { useMemo, type ReactElement, type ReactNode } from "react";
import {
  StatCard,
  StatCardDescription,
  StatCardHeader,
  StatCardIcon,
  StatCardLabel,
  StatCardValue,
} from "@schemavaults/ui";
import {
  Activity,
  Clock,
  Gauge,
  Hourglass,
  Layers,
  Timer,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { TRACE_TILES } from "../tiles";
import { traceDurationMs, type TraceSample } from "../trace-analytics";
import { LocalDateTime } from "@schemavaults/auth-ui";
import {
  formatCount,
  formatDuration,
  formatRatePerMinute,
  formatSpan,
} from "../format";
import { TraceTileCard } from "./TraceTileCard";
import type { TraceTileProps } from "./tile-props";

interface StatProps {
  label: string;
  value: ReactNode;
  description: ReactNode;
  Icon: LucideIcon;
  loading: boolean;
  testId: string;
}

function Stat({ label, value, description, Icon, loading, testId }: StatProps): ReactElement {
  return (
    <StatCard size="sm" data-testid={testId}>
      <StatCardHeader>
        <StatCardLabel size="sm">{label}</StatCardLabel>
        <StatCardIcon size="sm">
          <Icon />
        </StatCardIcon>
      </StatCardHeader>
      <StatCardValue size="sm" loading={loading}>
        {value}
      </StatCardValue>
      <StatCardDescription className="truncate">{description}</StatCardDescription>
    </StatCard>
  );
}

/** Headline numbers of the filtered sample, as a row of stat tiles. */
export function SummaryTile({
  traces,
  summary,
  matchingCount,
  loading,
  refreshing,
}: TraceTileProps): ReactElement {
  const slowest: TraceSample | undefined = useMemo(
    (): TraceSample | undefined =>
      traces.reduce<TraceSample | undefined>(
        (current, trace) =>
          !current || traceDurationMs(trace) > traceDurationMs(current) ? trace : current,
        undefined,
      ),
    [traces],
  );

  const sampled: boolean = matchingCount !== null && matchingCount > summary.count;

  return (
    <TraceTileCard
      tile={TRACE_TILES.summary}
      description="Computed over the loaded sample of traces matching the filters."
      refreshing={refreshing}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          testId="trace-stat-count"
          label="Traces"
          value={formatCount(summary.count)}
          description={
            sampled
              ? `most recent of ${formatCount(matchingCount!)} matching`
              : "every matching trace"
          }
          Icon={Activity}
          loading={loading}
        />
        <Stat
          testId="trace-stat-operations"
          label="Operations"
          value={formatCount(summary.operations)}
          description={`across ${summary.categories} ${summary.categories === 1 ? "category" : "categories"}`}
          Icon={Layers}
          loading={loading}
        />
        <Stat
          testId="trace-stat-span"
          label="Time span"
          value={formatSpan(summary.span_ms)}
          description={
            summary.first_start !== null ? (
              <>
                oldest <LocalDateTime value={summary.first_start} />
              </>
            ) : (
              "no traces"
            )
          }
          Icon={Clock}
          loading={loading}
        />
        <Stat
          testId="trace-stat-throughput"
          label="Throughput"
          value={formatRatePerMinute(summary.per_minute)}
          description="traces per minute over the span"
          Icon={Gauge}
          loading={loading}
        />
        <Stat
          testId="trace-stat-p50"
          label="Median duration"
          value={formatDuration(summary.p50)}
          description={`mean ${formatDuration(summary.mean)}`}
          Icon={Timer}
          loading={loading}
        />
        <Stat
          testId="trace-stat-p95"
          label="p95 duration"
          value={formatDuration(summary.p95)}
          description={`p90 ${formatDuration(summary.p90)}`}
          Icon={TrendingUp}
          loading={loading}
        />
        <Stat
          testId="trace-stat-p99"
          label="p99 duration"
          value={formatDuration(summary.p99)}
          description={`total ${formatDuration(summary.total)}`}
          Icon={TrendingUp}
          loading={loading}
        />
        <Stat
          testId="trace-stat-max"
          label="Slowest trace"
          value={formatDuration(summary.max)}
          description={slowest ? slowest.op_name : "no traces"}
          Icon={Hourglass}
          loading={loading}
        />
      </div>
    </TraceTileCard>
  );
}

export default SummaryTile;
