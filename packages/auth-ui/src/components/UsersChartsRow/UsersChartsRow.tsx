"use client";

import type { ReactElement } from "react";
import { cn } from "@schemavaults/ui";
import type { UserData } from "@schemavaults/auth-common";
import UsersGrowthCard from "./UsersGrowthCard";
import UsersBreakdownCard from "./UsersBreakdownCard";
import type { UserGrowthRangeId } from "./user-chart-data";

export interface UsersChartsRowProps {
  /**
   * SSR-preloaded users, used as SWR `fallbackData` so both charts render on
   * first paint. Both cards read the same SWR key as the users table, so the
   * page still makes a single request for the list.
   */
  preloaded?: readonly UserData[];
  /** Range the sign-ups chart opens on. Defaults to the trailing 30 days. */
  defaultGrowthRange?: UserGrowthRangeId;
  className?: string;
}

/**
 * @description The charts shown above the users table on `/admin/users`:
 * sign-ups over time (spikes and cumulative growth) alongside the standard /
 * admin / disabled split of every account.
 */
export function UsersChartsRow(props: UsersChartsRowProps): ReactElement {
  return (
    <div
      className={cn(
        "grid w-full grid-cols-1 gap-4 lg:grid-cols-3",
        props.className,
      )}
    >
      <UsersGrowthCard
        preloaded={props.preloaded}
        defaultRange={props.defaultGrowthRange}
        className="lg:col-span-2"
      />
      <UsersBreakdownCard preloaded={props.preloaded} />
    </div>
  );
}

export default UsersChartsRow;
