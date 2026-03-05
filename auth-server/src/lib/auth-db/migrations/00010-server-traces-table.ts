// 00010-server-traces-table.ts
// Creates the server_traces table for storing server operation traces

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS SERVER_TRACES (
      event_id TEXT PRIMARY KEY,
      op_name TEXT NOT NULL,
      op_category TEXT NOT NULL,
      start_time BIGINT NOT NULL,
      end_time BIGINT NOT NULL
    );
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("server_traces").execute();
}
