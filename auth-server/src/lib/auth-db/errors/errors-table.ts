import type { Insertable, Selectable } from "@schemavaults/dbh";

export interface ErrorsTable {
  error_id: string;
  created_at: number;
  name: string;
  message: string;
  stack: string | null;
  op_name: string | null;
  route: string | null;
  uid: string | null;
  context: unknown | null;
}

export type ErrorRow = Selectable<ErrorsTable>;
export type NewErrorRow = Insertable<ErrorsTable>;
