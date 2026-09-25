"use client";

import { useCallback, type ReactElement } from "react";
import { ServerTracesTable } from "@/components/ServerTracesTable";
import { TRACE_TILES } from "../tiles";
import { formatCount } from "../format";
import { TraceTileCard } from "./TraceTileCard";
import type { TraceTileProps } from "./tile-props";

/** The individual traces of the sample, newest first. */
export function TraceLogTile({
  traces,
  loading,
  refreshing,
  selectedOperations,
  toggleOperation,
}: TraceTileProps): ReactElement {
  const filterByOperation = useCallback(
    (op_name: string): void => {
      if (!selectedOperations.includes(op_name)) {
        toggleOperation(op_name);
      }
    },
    [selectedOperations, toggleOperation],
  );

  return (
    <TraceTileCard
      tile={TRACE_TILES["trace-log"]}
      description={`${formatCount(traces.length)} traces, newest first.`}
      refreshing={refreshing}
    >
      <ServerTracesTable
        traces={traces}
        loading={loading}
        onFilterByOperation={filterByOperation}
      />
    </TraceTileCard>
  );
}

export default TraceLogTile;
