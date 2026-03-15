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
import { existsSync, statSync } from "fs";
import type { IMigrationResult } from "@schemavaults/dbh/migrate";

interface ISuccessfulTestEnvironmentDbMigrationResponse {
  success: true;
  error: false;
  message: string;
  migrations_applied?: readonly string[];
}

async function trigger_db_migration(
  db: Kysely<AuthDatabase>,
  MIGRATIONS_PATH: string
) {
  const migrateToLatest = await import(
    "@/lib/auth-db/migrate-to-latest"
  ).then(mod => mod.default);
  return await migrateToLatest(db, MIGRATIONS_PATH);
}

/**
 * @environment test - This will only work when getAppEnvironment() === 'test'
 * @returns JSON based on whether a database migration was triggered
 */
export default async function trigger_database_migration(req: NextRequest): Promise<NextResponse> {
  void req;
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  // only allow use of this in test environment
  if (environment !== 'test') {
    return NextResponse.json({
      error: "Route only available in test environment",
      success: false
    }, {
      status: 404
    })
  } else {
    await using dbh = ServerlessDatabase.createDBH();

    if (!process.env.MIGRATIONS_PATH || typeof process.env.MIGRATIONS_PATH !== 'string') {
      return NextResponse.json(
        {
          success: false,
          message: "MIGRATIONS_PATH environment variable must be configured in order to use this feature.",
        } satisfies ResourceCreationResponse,
        {
          status: 500,
        },
      );
    }

    let result: readonly IMigrationResult[] = [];
    try {
      const MIGRATIONS_PATH = process.env.MIGRATIONS_PATH as string;
      if (debug) {
        console.log("Triggering database migration from migrations path: ", MIGRATIONS_PATH);
      }

      if (!existsSync(MIGRATIONS_PATH)) {
        throw new Error("Path specified by MIGRATIONS_PATH does not exist!")
      } else if (!statSync(MIGRATIONS_PATH).isDirectory()) {
        throw new Error("Path specified by MIGRATIONS_PATH is not a directory!")
      }

      const migrationResults = await trigger_db_migration(dbh.db, MIGRATIONS_PATH);
      if (migrationResults) {
        result = migrationResults;
      }
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

    console.log("Successfully applied @schemavaults/auth-server database migrations: ", result);



    const responseBody: ISuccessfulTestEnvironmentDbMigrationResponse = {
      success: true,
      error: false,
      message: "Successfully applied @schemavaults/auth-server database migrations!",
    }

    if (Array.isArray(result) && result.length > 0) {
      const migrations_applied: readonly string[] = result.map((migration: IMigrationResult): string | undefined => {
        if (typeof migration !== 'object') {
          return undefined;
        }

        if ("migrationName" in migration && typeof migration.migrationName === 'string') {
          return migration.migrationName;
        }

        return undefined;
      }).filter(migration_id => typeof migration_id === 'string');

      if (migrations_applied.length > 0) {
        responseBody['migrations_applied'] = migrations_applied;
      }
    }

    return NextResponse.json(
      responseBody satisfies ISuccessfulTestEnvironmentDbMigrationResponse,
      {
        status: 200,
      },
    );
  }
}
