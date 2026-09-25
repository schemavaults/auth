"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export const TRACE_TILE_IDS = [
  "summary",
  "duration-histogram",
  "duration-scatter",
  "latency-over-time",
  "throughput",
  "category-breakdown",
  "slowest-operations",
  "busiest-operations",
  "operation-stats",
  "trace-log",
] as const;

export type TraceTileId = (typeof TRACE_TILE_IDS)[number];

export interface TraceTileDescriptor {
  id: TraceTileId;
  label: string;
  description: string;
  /** Spans both columns of the tile grid on wide screens. */
  wide: boolean;
}

export const TRACE_TILES: Record<TraceTileId, TraceTileDescriptor> = {
  summary: {
    id: "summary",
    label: "Summary statistics",
    description: "Trace count, operations, time span, throughput and duration percentiles",
    wide: true,
  },
  "duration-histogram": {
    id: "duration-histogram",
    label: "Duration histogram",
    description: "How trace durations are distributed",
    wide: false,
  },
  "duration-scatter": {
    id: "duration-scatter",
    label: "Duration scatter plot",
    description: "Every trace by start time and duration",
    wide: false,
  },
  "latency-over-time": {
    id: "latency-over-time",
    label: "Latency over time",
    description: "Median and p95 duration per time bucket",
    wide: false,
  },
  throughput: {
    id: "throughput",
    label: "Throughput",
    description: "Traces recorded per time bucket",
    wide: false,
  },
  "category-breakdown": {
    id: "category-breakdown",
    label: "Category breakdown",
    description: "Share of traces per category",
    wide: false,
  },
  "slowest-operations": {
    id: "slowest-operations",
    label: "Slowest operations",
    description: "Operations ranked by p95 duration",
    wide: false,
  },
  "busiest-operations": {
    id: "busiest-operations",
    label: "Busiest operations",
    description: "Operations ranked by trace count",
    wide: false,
  },
  "operation-stats": {
    id: "operation-stats",
    label: "Per-operation statistics",
    description: "Count and duration percentiles for every operation",
    wide: true,
  },
  "trace-log": {
    id: "trace-log",
    label: "Trace log",
    description: "The individual traces",
    wide: true,
  },
};

export const DEFAULT_VISIBLE_TRACE_TILES: readonly TraceTileId[] = [
  "summary",
  "duration-histogram",
  "duration-scatter",
  "latency-over-time",
  "throughput",
  "slowest-operations",
  "busiest-operations",
  "operation-stats",
  "trace-log",
];

export function isTraceTileId(value: unknown): value is TraceTileId {
  return (
    typeof value === "string" &&
    (TRACE_TILE_IDS as readonly string[]).includes(value)
  );
}

const STORAGE_KEY: string = "schemavaults:admin-traces:visible-tiles";

/** Keeps `ids` in dashboard order, dropping unknown and duplicate ids. */
function normalizeTileIds(ids: readonly unknown[]): TraceTileId[] {
  return TRACE_TILE_IDS.filter((id: TraceTileId): boolean => ids.includes(id));
}

function parseStoredTiles(raw: string | null): TraceTileId[] | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeTileIds(parsed) : null;
  } catch {
    return null;
  }
}

/**
 * The viewer's latest choice in this tab, so it applies even where storage
 * is blocked (private windows); storage carries it across visits.
 */
let session_choice: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string | null {
  if (session_choice !== null) {
    return session_choice;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

/**
 * The tiles the viewer chose to show, remembered in this browser. The
 * server render and hydration use the defaults; the stored choice applies
 * right after.
 */
export function useVisibleTraceTiles(): [
  readonly TraceTileId[],
  (ids: readonly string[]) => void,
] {
  const raw: string | null = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const visible: readonly TraceTileId[] = useMemo(
    (): readonly TraceTileId[] => parseStoredTiles(raw) ?? DEFAULT_VISIBLE_TRACE_TILES,
    [raw],
  );

  const update = useCallback((ids: readonly string[]): void => {
    session_choice = JSON.stringify(normalizeTileIds(ids));
    try {
      window.localStorage.setItem(STORAGE_KEY, session_choice);
    } catch {
      // Blocked storage only forgets the choice on the next visit.
    }
    listeners.forEach((listener: () => void): void => listener());
  }, []);

  return [visible, update];
}
