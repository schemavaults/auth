import { z, publicAccess, type HttpMethod } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import {
  TEST_ENVIRONMENT_ONLY_NOTE,
  TEST_ENVIRONMENT_UNAVAILABLE_BODY,
  testEnvironmentUnavailableResponse,
} from "@/lib/api/domain-schemas/test-environment";
import { ErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import trigger from "./trigger_database_migration";

const ROUTE = "/api/test/seed/migrate-test-environment-db";

export const MigrateTestEnvironmentDbResponse = z
  .object({
    success: z.literal(true),
    error: z.literal(false),
    message: z.string(),
    migrations_applied: z
      .array(z.string().openapi({ example: "00001_initial_schema" }))
      .readonly()
      .optional()
      .openapi({ description: "Names of the migrations applied by this call; absent when the database was already up to date" }),
  })
  .openapi("MigrateTestEnvironmentDbResponse");

/**
 * `GET` and `POST` do the same thing: the Cypress suite POSTs before a run,
 * `GET` remains for triggering a migration from a browser.
 */
function defineMigrateOperation(method: HttpMethod) {
  return defineOperation({
    method,
    path: ROUTE,
    summary: "Migrate the test database",
    description:
      "Applies every pending database migration found under the server's `MIGRATIONS_PATH` directory. The Cypress suite calls this before running so the test database matches the checked-out schema. `GET` and `POST` behave identically.",
    tags: [API_TAGS.testEnvironment],
    auth: publicAccess(TEST_ENVIRONMENT_ONLY_NOTE),
    responses: {
      200: { description: "The database is up to date", schema: MigrateTestEnvironmentDbResponse },
      ...testEnvironmentUnavailableResponse,
      500: {
        description: "`MIGRATIONS_PATH` is not configured or does not name a directory, or a migration failed",
        schema: ErrorResponse,
      },
    },
    handler: async (ctx) => {
      const { db, debug, environment } = ctx.context;
      if (environment !== "test") {
        return ctx.json(404, TEST_ENVIRONMENT_UNAVAILABLE_BODY);
      }
      return await trigger(db, debug);
    },
  });
}

export const migrateTestEnvironmentDb = defineMigrateOperation("post");
export const migrateTestEnvironmentDbViaGet = defineMigrateOperation("get");
