import "server-only";

import {
  ServerlessDatabase,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import { type NextRequest, NextResponse } from "next/server";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { Kysely } from "@schemavaults/dbh";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";

async function trigger_db_migration(
  db: Kysely<AuthDatabase>
): Promise<void> {
  const migrateToLatest: (db: Kysely<any>) => Promise<void> = await import(
    "@/lib/auth-db/migrate-to-latest"
  ).then(mod => mod.default);
  await migrateToLatest(db);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  if (environment === 'test') {
    await using dbh = ServerlessDatabase.createDBH();

    try {
      if (debug) {
        console.log("Triggering database migration...")
      }
      await trigger_db_migration(dbh.db)
    } catch (e: unknown) {
      const baseErrorMessage: string = "Error attempting to initialize @schemavaults/auth-server postgres database";
      console.error(
        `${baseErrorMessage}: `,
        e,
      );

      let errorMessage: string = baseErrorMessage;
      if (e instanceof Error) {
        errorMessage += ". ";
        errorMessage += e.message;
      }

      return NextResponse.json(
        {
          success: false,
          message: errorMessage,
        } satisfies ResourceCreationResponse,
        {
          status: 500,
        },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Successfully applied @schemavaults/auth-server database migrations!",
      },
      {
        status: 200,
      },
    );
  } else {
    return NextResponse.json({
      error: "Route not available in this environment",
      success: false
    }, {
      status: 404
    })
  }
}
