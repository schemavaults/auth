"use client";

import { useMemo, useState, type ReactElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Sparkline,
  StatCardTrend,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from "@schemavaults/ui";
import type { UserData } from "@schemavaults/auth-common";
import { useAllUsersList } from "@/components/UsersTable/useAllUsersList";
import useMeasuredWidth from "@/lib/useMeasuredWidth";
import {
  USER_GROWTH_RANGE_IDS,
  USER_GROWTH_RANGE_LABELS,
  buildUserGrowthSeries,
  describeUserGrowthTrend,
  formatUtcDay,
  isUserGrowthRangeId,
  type UserGrowthBucket,
  type UserGrowthRangeId,
  type UserGrowthSeries,
  type UserGrowthTrend,
} from "./user-chart-data";

export interface UsersGrowthCardProps {
  /** SSR-preloaded users, used as SWR `fallbackData`. */
  preloaded?: readonly UserData[];
  /** Range selected on first render. Defaults to the trailing 30 days. */
  defaultRange?: UserGrowthRangeId;
  className?: string;
}

/** Widths used for the server render, until the resize observer reports. */
const SIGNUPS_FALLBACK_WIDTH: number = 560;
const TOTAL_FALLBACK_WIDTH: number = 240;

const RANGE_TO_SPOKEN_LABEL: Record<UserGrowthRangeId, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "all time",
};

function describeBucketWidth(bucket_days: number): string {
  return bucket_days === 1 ? "day" : `${bucket_days}-day period`;
}

function describePeak(peak: UserGrowthBucket, bucket_days: number): string {
  const signups: string = `${peak.signups} sign-up${peak.signups === 1 ? "" : "s"}`;
  if (bucket_days === 1) {
    return `Busiest ${describeBucketWidth(bucket_days)}: ${signups} on ${formatUtcDay(peak.start)}.`;
  }
  // `end` is exclusive, so step back inside the bucket to name its last day.
  return `Busiest ${describeBucketWidth(bucket_days)}: ${signups} between ${formatUtcDay(peak.start)} and ${formatUtcDay(peak.end - 1)}.`;
}

/**
 * @description Charts account creation over a selectable trailing window: a
 * bar sparkline of sign-ups per bucket, where a tall bar is an influx spike,
 * above a cumulative area sparkline of the total account count.
 */
export function UsersGrowthCard(props: UsersGrowthCardProps): ReactElement {
  const users = useAllUsersList({ initialData: props.preloaded });
  const [range, setRange] = useState<UserGrowthRangeId>(
    props.defaultRange ?? "30d",
  );

  const series: UserGrowthSeries = useMemo(
    (): UserGrowthSeries => buildUserGrowthSeries(users.data ?? [], range),
    [users.data, range],
  );

  const trend: UserGrowthTrend | null = useMemo(
    (): UserGrowthTrend | null => describeUserGrowthTrend(series),
    [series],
  );

  const signups_per_bucket: number[] = useMemo(
    (): number[] =>
      series.buckets.map((bucket: UserGrowthBucket): number => bucket.signups),
    [series.buckets],
  );

  const cumulative_per_bucket: number[] = useMemo(
    (): number[] =>
      series.buckets.map(
        (bucket: UserGrowthBucket): number => bucket.cumulative,
      ),
    [series.buckets],
  );

  const signups_chart = useMeasuredWidth<HTMLDivElement>(
    SIGNUPS_FALLBACK_WIDTH,
  );
  const total_chart = useMeasuredWidth<HTMLDivElement>(TOTAL_FALLBACK_WIDTH);

  const loading: boolean = !users.data;
  const first_bucket: UserGrowthBucket | undefined = series.buckets[0];
  const last_bucket: UserGrowthBucket | undefined =
    series.buckets[series.buckets.length - 1];
  const bucket_label: string = describeBucketWidth(series.bucket_days);
  const spoken_range: string = RANGE_TO_SPOKEN_LABEL[range];

  return (
    <Card className={cn("w-full", props.className)} data-testid="users-growth-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2 space-y-0">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle>New users</CardTitle>
          <CardDescription>
            Sign-ups per {bucket_label} (UTC) — a tall bar is an influx spike.
          </CardDescription>
        </div>
        <ToggleGroup
          type="single"
          value={range}
          onValueChange={(next: string): void => {
            // Radix-style toggle groups emit "" when the active item is
            // clicked again; keep the current selection in that case.
            if (isUserGrowthRangeId(next)) {
              setRange(next);
            }
          }}
          variant="outline"
          size="sm"
          className="flex shrink-0 flex-row flex-wrap gap-1"
          aria-label="Sign-up chart range"
        >
          {USER_GROWTH_RANGE_IDS.map(
            (range_id: UserGrowthRangeId): ReactElement => (
              <ToggleGroupItem
                key={range_id}
                value={range_id}
                data-testid={`users-growth-range-${range_id}`}
              >
                {USER_GROWTH_RANGE_LABELS[range_id]}
              </ToggleGroupItem>
            ),
          )}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-row flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={cn(
              "text-3xl font-semibold tabular-nums leading-none",
              loading && "animate-pulse opacity-60",
            )}
            data-testid="users-growth-signups-value"
          >
            {series.signups}
          </span>
          <span className="text-muted-foreground text-sm">
            new {series.signups === 1 ? "account" : "accounts"} ({spoken_range})
          </span>
          {trend && trend.comparable ? (
            <StatCardTrend direction={trend.direction}>
              {trend.percent > 0 ? "+" : ""}
              {trend.percent}% vs previous {spoken_range}
            </StatCardTrend>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <div ref={signups_chart.ref} className="w-full">
            <Sparkline
              data={signups_per_bucket}
              variant="bar"
              color="default"
              min={0}
              width={signups_chart.width}
              height={72}
              label={`Sign-ups per ${bucket_label} over ${spoken_range}: ${series.signups} in total`}
              className={cn("w-full", loading && "animate-pulse opacity-60")}
              data-testid="users-growth-signups-sparkline"
            />
          </div>
          {first_bucket && last_bucket ? (
            <div className="text-muted-foreground flex flex-row justify-between text-xs tabular-nums">
              <span>{formatUtcDay(first_bucket.start)}</span>
              <span>{formatUtcDay(last_bucket.end - 1)}</span>
            </div>
          ) : null}
        </div>

        <p className="text-muted-foreground text-xs">
          {series.peak
            ? describePeak(series.peak, series.bucket_days)
            : `No accounts were created in the last ${spoken_range}.`}
          {trend && !trend.comparable
            ? ` No sign-ups in the previous ${spoken_range}.`
            : ""}
        </p>

        <Separator />

        <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-muted-foreground shrink-0 text-xs font-medium uppercase tracking-wide">
            Total users
          </span>
          <div ref={total_chart.ref} className="min-w-24 flex-1">
            <Sparkline
              data={cumulative_per_bucket}
              variant="area"
              color="default"
              width={total_chart.width}
              height={32}
              label={`Total registered accounts over ${spoken_range}, ending at ${series.total}`}
              className={cn("w-full", loading && "animate-pulse opacity-60")}
              data-testid="users-growth-total-sparkline"
            />
          </div>
          <span
            className="shrink-0 text-sm font-semibold tabular-nums"
            data-testid="users-growth-total-value"
          >
            {series.total}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default UsersGrowthCard;
