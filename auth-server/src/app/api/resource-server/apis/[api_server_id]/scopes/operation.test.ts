import { describe, expect, mock, test } from "bun:test";
import type { AuthResolvers } from "@schemavaults/openapi-operations";
import type { UserData } from "@schemavaults/auth-common";
import type { AuthServerApiContext } from "@/lib/api/context";

// The operation's imports pull in the `server-only` marker, which throws
// outside a React Server Components bundle.
mock.module("server-only", () => ({}));

const API_SERVER_ID = "notes-api" as const;
const ROUTE = `/api/resource-server/apis/${API_SERVER_ID}/scopes` as const;

/**
 * Just enough of Kysely for the handler: ERRORS inserts are recorded, and
 * the API server lookup of a dry run finds nothing (so a request that gets
 * past the caller check ends in 404 `api_server_not_found`).
 */
function fakeDb(): { db: unknown; errors: Record<string, unknown>[] } {
  const errors: Record<string, unknown>[] = [];
  const query = {
    where: () => query,
    select: () => query,
    executeTakeFirst: async () => undefined,
  };
  const db = {
    insertInto: (table: string) => ({
      values: (row: Record<string, unknown>) => ({
        execute: async () => {
          if (table === "errors") errors.push(row);
        },
      }),
    }),
    selectFrom: () => query,
  };
  return { db, errors };
}

/** The operation behind a resolver that reports `clientId` as the caller. */
async function appWithCaller(clientId: string | undefined) {
  const { createOperationsApp } = await import("@schemavaults/openapi-operations");
  const { jwksAccessAssertionScheme } = await import("@/lib/api/auth-schemes");
  const { syncResourceServerApiScopes } = await import("./operation");
  const { db, errors } = fakeDb();
  const authResolvers: AuthResolvers<UserData, AuthServerApiContext> = {
    [jwksAccessAssertionScheme.name]: async (_c, scheme) => ({
      scheme: scheme.name,
      user: null,
      isAdmin: false,
      scope: null,
      ...(clientId === undefined ? {} : { clientId }),
    }),
  };
  const app = createOperationsApp<AuthServerApiContext, UserData>({
    operations: [syncResourceServerApiScopes],
    authResolvers,
    context: () => ({ db, environment: "test", debug: false }) as unknown as AuthServerApiContext,
  });
  return { app, errors };
}

function putDryRun(app: { request: (input: string, init: RequestInit) => Response | Promise<Response> }) {
  return app.request(`${ROUTE}?dry_run=true`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer stubbed" },
    body: JSON.stringify({ scopes: [{ scope: "notes:read", description: "Read your notes." }] }),
  });
}

describe("PUT /api/resource-server/apis/{api_server_id}/scopes caller check", () => {
  test("refuses with 403 and records the error when the assertion is for another API server", async () => {
    for (const clientId of ["other-api", undefined]) {
      const { app, errors } = await appWithCaller(clientId);
      const response = await putDryRun(app);
      expect(response.status, String(clientId)).toBe(403);
      expect(await response.json()).toEqual({
        success: false,
        error: "api_server_mismatch",
        message: "Forbidden - an API server can only sync its own API scopes",
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]?.op_name).toBe("resource-server-api-scopes.callerMismatch");
    }
  });

  test("lets the API server the path names through to the sync", async () => {
    const { app, errors } = await appWithCaller(API_SERVER_ID);
    const response = await putDryRun(app);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error?: string }).error).toBe("api_server_not_found");
    expect(errors).toEqual([]);
  });
});
