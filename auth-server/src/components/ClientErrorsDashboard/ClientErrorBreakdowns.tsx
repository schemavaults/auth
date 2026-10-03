"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import {
  Badge,
  BarList,
  type BarListItem,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@schemavaults/ui";
import { ExternalLink, Filter, FilterX } from "lucide-react";
import { LocalDateTime } from "@schemavaults/auth-ui";
import type { ClientErrorGroupStats, ClientErrorStats } from "@/lib/auth-db/client-errors";
import { CLIENT_ERROR_STATS_TOP_N } from "@/lib/client-errors/client-error-stats-limits";
import { describeError, formatCount, pluralize } from "./format";

export interface ClientErrorBreakdownsProps {
  stats: ClientErrorStats;
  selectedApp: string | null;
  selectedGroup: string | null;
  onSelectApp: (client_app_id: string | null) => void;
  onSelectGroup: (fingerprint: string | null) => void;
  loading: boolean;
}

function TopGroupsCard({
  groups,
  selectedGroup,
  onSelectGroup,
}: {
  groups: readonly ClientErrorGroupStats[];
  selectedGroup: string | null;
  onSelectGroup: (fingerprint: string | null) => void;
}): ReactElement {
  return (
    <Card className="min-w-0 lg:col-span-2" data-testid="client-errors-top-groups">
      <CardHeader>
        <CardTitle className="text-base">Top error groups</CardTitle>
        <CardDescription>
          The {CLIENT_ERROR_STATS_TOP_N} most frequent errors. Reports are grouped by error name, message pattern
          (ids and numbers ignored) and operation.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 overflow-x-auto">
        {groups.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">No client errors in this view.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Error</TableHead>
                <TableHead className="text-right">Events</TableHead>
                <TableHead className="text-right">Apps</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group: ClientErrorGroupStats): ReactElement => {
                const selected: boolean = group.fingerprint === selectedGroup;
                return (
                  <TableRow
                    key={group.fingerprint}
                    data-state={selected ? "selected" : undefined}
                    data-testid="client-errors-group-row"
                  >
                    <TableCell className="max-w-[28rem]">
                      <div className="truncate font-mono text-xs" title={describeError(group.name, group.message)}>
                        <span className="font-semibold">{group.name}</span>
                        {group.message ? `: ${group.message}` : null}
                      </div>
                      {group.operation ? (
                        <Badge variant="outline" className="mt-1 font-mono text-[10px]">
                          {group.operation}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(group.count)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(group.apps)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCount(group.users)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      <LocalDateTime value={group.last_seen} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(): void => onSelectGroup(selected ? null : group.fingerprint)}
                        aria-pressed={selected}
                        title={selected ? "Show every group" : "Only show this group"}
                      >
                        {selected ? <FilterX className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
                        <span className="sr-only">{selected ? "Show every group" : "Only show this group"}</span>
                      </Button>
                      <Button asChild variant="ghost" size="sm" title="Latest report">
                        <Link href={`/admin/client-errors/${group.latest_client_error_id}`}>
                          <ExternalLink className="h-4 w-4" />
                          <span className="sr-only">Latest report</span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title,
  description,
  testId,
  items,
  selectedIds,
  onSelect,
  loading,
}: {
  title: string;
  description: string;
  testId: string;
  items: BarListItem[];
  selectedIds?: string[];
  onSelect?: (item: BarListItem) => void;
  loading: boolean;
}): ReactElement {
  return (
    <Card className="min-w-0" data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        <BarList
          items={items}
          label={title}
          color="destructive"
          labelClassName="font-mono text-xs"
          selectedIds={selectedIds}
          onSelect={onSelect}
          loading={loading}
          emptyMessage="No client errors in this view."
        />
      </CardContent>
    </Card>
  );
}

/** Where the errors in the view come from: groups, apps, SDK versions and operations. */
export function ClientErrorBreakdowns({
  stats,
  selectedApp,
  selectedGroup,
  onSelectApp,
  onSelectGroup,
  loading,
}: ClientErrorBreakdownsProps): ReactElement {
  const appItems: BarListItem[] = stats.by_app.map(
    (app): BarListItem => ({
      id: app.client_app_id,
      label: app.client_app_id,
      value: app.count,
      detail: pluralize(app.groups, "group"),
    }),
  );
  const sdkItems: BarListItem[] = stats.by_sdk_version.map(
    (sdk): BarListItem => ({
      id: `${sdk.sdk_name ?? ""}@${sdk.sdk_version ?? ""}`,
      label: sdk.sdk_name ? `${sdk.sdk_name}@${sdk.sdk_version ?? "?"}` : "Unknown sender",
      value: sdk.count,
    }),
  );
  const operationItems: BarListItem[] = stats.by_operation.map(
    (op): BarListItem => ({
      id: op.operation ?? "",
      label: op.operation ?? "(not reported)",
      value: op.count,
    }),
  );

  return (
    <>
      <TopGroupsCard groups={stats.top_groups} selectedGroup={selectedGroup} onSelectGroup={onSelectGroup} />
      <BreakdownCard
        title="By app"
        description="Client applications with the most errors. Select one to filter."
        testId="client-errors-by-app"
        items={appItems}
        selectedIds={selectedApp ? [selectedApp] : []}
        onSelect={(item: BarListItem): void => onSelectApp(item.id === selectedApp ? null : item.id)}
        loading={loading}
      />
      <BreakdownCard
        title="By SDK version"
        description="Which client SDK releases sent the reports."
        testId="client-errors-by-sdk"
        items={sdkItems}
        loading={loading}
      />
      <BreakdownCard
        title="By operation"
        description="What the client was doing when the error happened."
        testId="client-errors-by-operation"
        items={operationItems}
        loading={loading}
      />
    </>
  );
}

export default ClientErrorBreakdowns;
