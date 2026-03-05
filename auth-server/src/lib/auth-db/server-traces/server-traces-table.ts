import type { Insertable, Selectable } from "@schemavaults/dbh";

export interface ServerTracesTable {
  event_id: string;
  op_name: string;
  op_category: string;
  start_time: number;
  end_time: number;
}

export type ServerTraceRow = Selectable<ServerTracesTable>;
export type NewServerTraceRow = Insertable<ServerTracesTable>;
