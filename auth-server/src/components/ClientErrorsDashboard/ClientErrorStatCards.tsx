"use client";

import type { ReactElement } from "react";
import {
  StatCard,
  StatCardDescription,
  StatCardHeader,
  StatCardIcon,
  StatCardLabel,
  StatCardTrend,
  StatCardValue,
} from "@schemavaults/ui";
import { AppWindow, Bug, Layers, Users } from "lucide-react";
import type { ClientErrorTotals } from "@/lib/auth-db/client-errors";
import { LocalDateTime } from "@schemavaults/auth-ui";
import { formatCount } from "./format";

export interface ClientErrorStatCardsProps {
  totals: ClientErrorTotals;
  /** Whether the view is limited to a time range (so a previous period exists). */
  ranged: boolean;
  loading: boolean;
}

function ErrorTrend({ errors, previous }: { errors: number; previous: number }): ReactElement {
  if (previous === 0) {
    return (
      <StatCardTrend direction={errors > 0 ? "up" : "neutral"} intent={errors > 0 ? "negative" : "neutral"}>
        {errors > 0 ? "none in the previous period" : "no change"}
      </StatCardTrend>
    );
  }
  const change: number = Math.round(((errors - previous) / previous) * 100);
  const direction = change > 0 ? "up" : change < 0 ? "down" : "neutral";
  // More errors is bad: an upward trend reads as negative.
  const intent = change > 0 ? "negative" : change < 0 ? "positive" : "neutral";
  return (
    <StatCardTrend direction={direction} intent={intent}>
      {change > 0 ? "+" : ""}
      {change}% vs previous period
    </StatCardTrend>
  );
}

/** Totals of the errors matching the dashboard filters. */
export function ClientErrorStatCards({ totals, ranged, loading }: ClientErrorStatCardsProps): ReactElement {
  const errorsIconVariant = totals.errors > 0 ? "destructive" : "default";
  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="client-errors-stats">
      <StatCard data-testid="client-errors-stat-errors">
        <StatCardHeader>
          <StatCardLabel>Errors</StatCardLabel>
          <StatCardIcon variant={errorsIconVariant}>
            <Bug />
          </StatCardIcon>
        </StatCardHeader>
        <StatCardValue loading={loading}>{formatCount(totals.errors)}</StatCardValue>
        <StatCardDescription>
          {ranged && totals.previous_period_errors !== null ? (
            <ErrorTrend errors={totals.errors} previous={totals.previous_period_errors} />
          ) : (
            <>
              Last report: <LocalDateTime value={totals.last_seen} fallback="never" />
            </>
          )}
        </StatCardDescription>
      </StatCard>

      <StatCard data-testid="client-errors-stat-groups">
        <StatCardHeader>
          <StatCardLabel>Error groups</StatCardLabel>
          <StatCardIcon>
            <Layers />
          </StatCardIcon>
        </StatCardHeader>
        <StatCardValue loading={loading}>{formatCount(totals.groups)}</StatCardValue>
        <StatCardDescription>Distinct errors (same name, message pattern and operation).</StatCardDescription>
      </StatCard>

      <StatCard data-testid="client-errors-stat-apps">
        <StatCardHeader>
          <StatCardLabel>Affected apps</StatCardLabel>
          <StatCardIcon>
            <AppWindow />
          </StatCardIcon>
        </StatCardHeader>
        <StatCardValue loading={loading}>{formatCount(totals.apps)}</StatCardValue>
        <StatCardDescription>Client applications that reported errors.</StatCardDescription>
      </StatCard>

      <StatCard data-testid="client-errors-stat-users">
        <StatCardHeader>
          <StatCardLabel>Affected users</StatCardLabel>
          <StatCardIcon>
            <Users />
          </StatCardIcon>
        </StatCardHeader>
        <StatCardValue loading={loading}>{formatCount(totals.users)}</StatCardValue>
        <StatCardDescription>Signed-in users the reports name (as reported by the clients).</StatCardDescription>
      </StatCard>
    </div>
  );
}

export default ClientErrorStatCards;
