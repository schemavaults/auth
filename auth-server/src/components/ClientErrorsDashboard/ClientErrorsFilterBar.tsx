"use client";

import { type FormEvent, type ReactElement, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@schemavaults/ui";
import { RefreshCw, Search, X } from "lucide-react";
import {
  CLIENT_ERROR_RANGE_IDS,
  CLIENT_ERROR_RANGE_LABELS,
  CLIENT_ERROR_SEARCH_MAX_LENGTH,
  type ClientErrorPageFilters,
  type ClientErrorRangeId,
  DEFAULT_CLIENT_ERROR_PAGE_FILTERS,
  isClientErrorRangeId,
} from "@/lib/client-errors/client-error-page-filters";

const ALL_APPS: string = "__all__";

export interface ClientErrorsFilterBarProps {
  filters: ClientErrorPageFilters;
  /** Apps to offer in the app filter. */
  appIds: readonly string[];
  /** One-line description of the selected group, when one is selected. */
  selectedGroupLabel: string | null;
  onFiltersChange: (filters: ClientErrorPageFilters) => void;
  onRefresh: () => void;
  loading: boolean;
}

/** Time range, app, group and text filters of the client errors dashboard. */
export function ClientErrorsFilterBar({
  filters,
  appIds,
  selectedGroupLabel,
  onFiltersChange,
  onRefresh,
  loading,
}: ClientErrorsFilterBarProps): ReactElement {
  const [search, setSearch] = useState<string>(filters.q ?? "");
  // Follow the URL when it changes underneath (back / forward, reset):
  // adjusted while rendering, as React recommends over an effect.
  const [syncedQ, setSyncedQ] = useState<string | null>(filters.q);
  if (syncedQ !== filters.q) {
    setSyncedQ(filters.q);
    setSearch(filters.q ?? "");
  }

  const update = (patch: Partial<ClientErrorPageFilters>): void =>
    onFiltersChange({ ...filters, ...patch, page: 1 });

  const onSearch = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const q: string = search.trim();
    update({ q: q ? q.slice(0, CLIENT_ERROR_SEARCH_MAX_LENGTH) : null });
  };

  const apps: string[] = [...new Set([...(filters.client_app_id ? [filters.client_app_id] : []), ...appIds])].sort();
  const filtered: boolean =
    filters.range !== DEFAULT_CLIENT_ERROR_PAGE_FILTERS.range ||
    filters.client_app_id !== null ||
    filters.fingerprint !== null ||
    filters.q !== null;

  return (
    <div className="flex flex-col gap-3" data-testid="client-errors-filters">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-errors-range" className="text-muted-foreground text-xs">
            Time range
          </Label>
          <Select
            value={filters.range}
            onValueChange={(value: string): void => {
              if (isClientErrorRangeId(value)) update({ range: value });
            }}
            disabled={loading}
          >
            <SelectTrigger id="client-errors-range" className="w-44" data-testid="client-errors-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_ERROR_RANGE_IDS.map(
                (range: ClientErrorRangeId): ReactElement => (
                  <SelectItem key={range} value={range}>
                    {CLIENT_ERROR_RANGE_LABELS[range]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-errors-app" className="text-muted-foreground text-xs">
            Client app
          </Label>
          <Select
            value={filters.client_app_id ?? ALL_APPS}
            onValueChange={(value: string): void => update({ client_app_id: value === ALL_APPS ? null : value })}
            disabled={loading}
          >
            <SelectTrigger id="client-errors-app" className="w-56" data-testid="client-errors-app">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_APPS}>All apps</SelectItem>
              {apps.map(
                (app_id: string): ReactElement => (
                  <SelectItem key={app_id} value={app_id} className="font-mono text-xs">
                    {app_id}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <form onSubmit={onSearch} className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:min-w-60 sm:flex-1" role="search">
          <Label htmlFor="client-errors-search" className="text-muted-foreground text-xs">
            Search
          </Label>
          <div className="flex gap-2">
            <Input
              id="client-errors-search"
              type="search"
              placeholder="Error name, message or operation"
              value={search}
              maxLength={CLIENT_ERROR_SEARCH_MAX_LENGTH}
              onChange={(e): void => setSearch(e.target.value)}
              className="min-w-0"
              data-testid="client-errors-search"
            />
            <Button type="submit" variant="secondary" disabled={loading} data-testid="client-errors-search-submit">
              <Search className="h-4 w-4" />
              <span className="sr-only">Search</span>
            </Button>
          </div>
        </form>

        <Button type="button" variant="outline" onClick={onRefresh} disabled={loading} data-testid="client-errors-refresh">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {filtered ? (
        <div className="flex flex-wrap items-center gap-2">
          {selectedGroupLabel !== null ? (
            <Badge variant="secondary" className="max-w-full gap-1" data-testid="client-errors-group-filter">
              <span className="truncate font-mono text-xs">Group: {selectedGroupLabel}</span>
              <button
                type="button"
                onClick={(): void => update({ fingerprint: null })}
                aria-label="Show every group"
                className="hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(): void => onFiltersChange(DEFAULT_CLIENT_ERROR_PAGE_FILTERS)}
            disabled={loading}
            data-testid="client-errors-reset-filters"
          >
            Reset filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default ClientErrorsFilterBar;
