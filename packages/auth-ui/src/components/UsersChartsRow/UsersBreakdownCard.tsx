"use client";

import { useMemo, type ReactElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PieChart,
  cn,
  type PieChartSegment,
  type PieChartSegmentColorId,
} from "@schemavaults/ui";
import type { UserData } from "@schemavaults/auth-common";
import { ShieldCheck, UserRound, UserX } from "lucide-react";
import { useAllUsersList } from "@/components/UsersTable/useAllUsersList";
import {
  summarizeUserBreakdown,
  type UserBreakdown,
  type UserCategoryId,
} from "./user-chart-data";

export interface UsersBreakdownCardProps {
  /** SSR-preloaded users, used as SWR `fallbackData`. */
  preloaded?: readonly UserData[];
  className?: string;
}

interface CategoryDescriptor {
  id: UserCategoryId;
  label: string;
  /** Preset from the `@schemavaults/ui` chart palette. */
  color: PieChartSegmentColorId;
  /** Matching Tailwind background for the legend swatch. */
  swatchClassName: string;
  Icon: typeof UserRound;
  /** Hover text; the legend itself stays a single line per category. */
  title: string;
}

/**
 * Blue / amber / red read as three distinct hues in both themes, and none of
 * them is `primary`, which is near-black in light mode and near-white in
 * dark mode and so cannot carry a chart segment.
 */
const CATEGORIES: readonly CategoryDescriptor[] = [
  {
    id: "normal",
    label: "Standard",
    color: "default",
    swatchClassName: "bg-schemavaults-brand-blue",
    Icon: UserRound,
    title: "Active accounts without administrator privileges.",
  },
  {
    id: "admin",
    label: "Admins",
    color: "warning",
    swatchClassName: "bg-warning",
    Icon: ShieldCheck,
    title:
      "Active accounts with administrator privileges. Disabled administrators are counted under Disabled, so this can be lower than the Admins stat card.",
  },
  {
    id: "disabled",
    label: "Disabled",
    color: "destructive",
    swatchClassName: "bg-destructive",
    Icon: UserX,
    title: "Accounts blocked from signing in, administrator or not.",
  },
];

function formatPercentage(count: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }
  const percent: number = (count / total) * 100;
  // Keep a decimal for slivers so a real-but-tiny slice never reads as "0%".
  if (percent > 0 && percent < 1) {
    return `${percent.toFixed(1)}%`;
  }
  return `${Math.round(percent)}%`;
}

/**
 * @description Breaks every registered account down into standard, admin and
 * disabled accounts as a donut chart. Each account is counted exactly once:
 * a disabled administrator counts as disabled, so the slices add up to the
 * total.
 */
export function UsersBreakdownCard(
  props: UsersBreakdownCardProps,
): ReactElement {
  const users = useAllUsersList({ initialData: props.preloaded });

  const breakdown: UserBreakdown = useMemo(
    (): UserBreakdown => summarizeUserBreakdown(users.data ?? []),
    [users.data],
  );

  const loading: boolean = !users.data;

  const segments: readonly PieChartSegment[] = useMemo(
    (): readonly PieChartSegment[] =>
      CATEGORIES.map(
        (category: CategoryDescriptor): PieChartSegment => ({
          id: category.id,
          value: breakdown[category.id],
          label: `${category.label}: ${breakdown[category.id]} of ${breakdown.total}`,
          color: category.color,
        }),
      ),
    [breakdown],
  );

  return (
    <Card
      className={cn("w-full", props.className)}
      data-testid="users-breakdown-card"
    >
      <CardHeader>
        <CardTitle>User breakdown</CardTitle>
        <CardDescription>
          Every account counted once — a disabled administrator counts as
          disabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-start">
        <PieChart
          segments={segments}
          label={
            loading
              ? "Loading the breakdown of users by role and status"
              : `Users by role and status: ${CATEGORIES.map(
                  (category: CategoryDescriptor): string =>
                    `${breakdown[category.id]} ${category.label.toLowerCase()}`,
                ).join(", ")}`
          }
          size="md"
          innerRadius={0.62}
          segmentGap={2}
          className={cn("shrink-0", loading && "animate-pulse opacity-60")}
          data-testid="users-breakdown-pie-chart"
        >
          <div className="flex flex-col items-center leading-none">
            <span className="text-2xl font-semibold tabular-nums">
              {breakdown.total}
            </span>
            <span className="text-muted-foreground text-xs">
              {breakdown.total === 1 ? "user" : "users"}
            </span>
          </div>
        </PieChart>

        <ul className="flex w-full min-w-0 flex-col gap-3">
          {CATEGORIES.map((category: CategoryDescriptor): ReactElement => {
            const count: number = breakdown[category.id];
            return (
              <li
                key={category.id}
                className="flex flex-row items-center gap-2.5"
                title={category.title}
                data-testid={`users-breakdown-legend-${category.id}`}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    category.swatchClassName,
                  )}
                />
                <category.Icon
                  aria-hidden="true"
                  className="text-muted-foreground size-4 shrink-0"
                />
                <span className="truncate text-sm font-medium">
                  {category.label}
                </span>
                <span className="ml-auto flex shrink-0 flex-row items-baseline gap-2">
                  <span className="text-sm font-semibold tabular-nums">
                    {count}
                  </span>
                  <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                    {formatPercentage(count, breakdown.total)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export default UsersBreakdownCard;
