import { describe, expect, mock, test } from "bun:test";
import type { AuthResolvers } from "@schemavaults/openapi-operations";
import type { UserData } from "@schemavaults/auth-common";
import type { AuthServerApiContext } from "@/lib/api/context";

// The operation's imports pull in the `server-only` marker, which throws
// outside a React Server Components bundle.
mock.module("server-only", () => ({}));

const API_SERVER_ID = "notes-api";
const CLIENT_APP_ID = "notes-web";
const ROUTE = `/api/apis/${API_SERVER_ID}/connect_app/${CLIENT_APP_ID}`;

/** What the stubbed registries were asked to do, and on which handle. */
interface Recorded {
  allowed: { client_app_id: string; api_server_id: string; trx: boolean }[];
  first_party: { client_app_id: string; api_server_id: string; first_party: boolean; trx: boolean }[];
  transactions: number;
  errors: Record<string, unknown>[];
}

const recorded: Recorded = { allowed: [], first_party: [], transactions: 0, errors: [] };
let allowThrows: Error | null = null;
let firstPartyThrows: Error | null = null;

function reset(): void {
  recorded.allowed = [];
  recorded.first_party = [];
  recorded.transactions = 0;
  recorded.errors = [];
  allowThrows = null;
  firstPartyThrows = null;
}

interface FakeHandle {
  isTransaction: boolean;
}

// The connection's resources exist and the caller may connect them (the
// access rule itself is covered by the E2E suite).
const connectionAccess = await import("./connection-access");
mock.module("./connection-access", () => ({
  ...connectionAccess,
  loadConnectionResources: async () => ({ ok: true, app: {}, apiServer: {} }),
}));

const authDb = await import("@/lib/auth-db");
class FakeAppToApiPermissionsRegistry {
  constructor(private readonly db: FakeHandle) {}
  async allow(client_app_id: string, api_server_id: string): Promise<void> {
    recorded.allowed.push({ client_app_id, api_server_id, trx: this.db.isTransaction });
    if (allowThrows) throw allowThrows;
  }
}
mock.module("@/lib/auth-db", () => ({
  ...authDb,
  SchemaVaultsAppToApiPermissionsRegistry: FakeAppToApiPermissionsRegistry,
}));

const authDbApis = await import("@/lib/auth-db/apis");
mock.module("@/lib/auth-db/apis", () => ({
  ...authDbApis,
  setFirstPartyAppApiConnection: async (
    db: FakeHandle,
    opts: { client_app_id: string; api_server_id: string; first_party: boolean },
  ): Promise<boolean> => {
    recorded.first_party.push({
      client_app_id: opts.client_app_id,
      api_server_id: opts.api_server_id,
      first_party: opts.first_party,
      trx: db.isTransaction,
    });
    if (firstPartyThrows) throw firstPartyThrows;
    return opts.first_party;
  },
}));

/** Just enough of Kysely: a transaction runner and ERRORS inserts. */
function fakeDb(): unknown {
  const trx: FakeHandle = { isTransaction: true };
  return {
    isTransaction: false,
    transaction: () => ({
      execute: async <T,>(fn: (trx: FakeHandle) => Promise<T>): Promise<T> => {
        recorded.transactions += 1;
        return await fn(trx);
      },
    }),
    insertInto: (table: string) => ({
      values: (row: Record<string, unknown>) => ({
        execute: async () => {
          if (table === "errors") recorded.errors.push(row);
        },
      }),
    }),
  };
}

const USER: UserData = {
  uid: "6f1c1f4e-8a39-4c43-9b3e-2f0d6a1d6a10",
  email: "owner@example.com",
} as unknown as UserData;

async function appAs(admin: boolean) {
  const { createOperationsApp } = await import("@schemavaults/openapi-operations");
  const { sessionSchemes } = await import("@/lib/api/auth-schemes");
  const { connectAppToApiServer } = await import("./post.operation");
  const user: UserData = { ...USER, admin } as UserData;
  const authResolvers: AuthResolvers<UserData, AuthServerApiContext> = Object.fromEntries(
    sessionSchemes.map((scheme) => [
      scheme.name,
      async () => ({ scheme: scheme.name, user, isAdmin: admin, scope: null }),
    ]),
  );
  return createOperationsApp<AuthServerApiContext, UserData>({
    operations: [connectAppToApiServer],
    authResolvers,
    context: () => ({ db: fakeDb(), environment: "test", debug: false }) as unknown as AuthServerApiContext,
  });
}

type App = Awaited<ReturnType<typeof appAs>>;

function post(app: App, path: string, init: { body?: string; contentType?: string } = {}) {
  const headers: Record<string, string> = { Authorization: "Bearer stubbed" };
  if (init.contentType) headers["Content-Type"] = init.contentType;
  return app.request(path, { method: "POST", headers, ...(init.body === undefined ? {} : { body: init.body }) });
}

describe("POST /api/apis/{api_server_id}/connect_app/{client_app_id}", () => {
  test("without a body connects the app exactly as before (no transaction, not first-party)", async () => {
    reset();
    const response = await post(await appAs(false), ROUTE);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      resource_id: API_SERVER_ID,
      first_party: false,
    });
    expect(recorded.allowed).toEqual([{ client_app_id: CLIENT_APP_ID, api_server_id: API_SERVER_ID, trx: false }]);
    expect(recorded.first_party).toEqual([]);
    expect(recorded.transactions).toBe(0);
  });

  test("first_party: false is the default, for anyone who may connect", async () => {
    reset();
    const response = await post(await appAs(false), ROUTE, {
      body: JSON.stringify({ first_party: false }),
      contentType: "application/json",
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { first_party: boolean }).first_party).toBe(false);
    expect(recorded.allowed).toHaveLength(1);
    expect(recorded.first_party).toEqual([]);
  });

  test("an administrator's first_party: true connects and marks it first-party in one transaction", async () => {
    reset();
    const response = await post(await appAs(true), ROUTE, {
      body: JSON.stringify({ first_party: true }),
      contentType: "application/json",
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { first_party: boolean }).first_party).toBe(true);
    expect(recorded.transactions).toBe(1);
    expect(recorded.allowed).toEqual([{ client_app_id: CLIENT_APP_ID, api_server_id: API_SERVER_ID, trx: true }]);
    expect(recorded.first_party).toEqual([
      { client_app_id: CLIENT_APP_ID, api_server_id: API_SERVER_ID, first_party: true, trx: true },
    ]);
  });

  test("accepts the body as text/plain JSON (browsers' default for fetch)", async () => {
    reset();
    const response = await post(await appAs(true), ROUTE, {
      body: JSON.stringify({ first_party: true }),
      contentType: "text/plain;charset=UTF-8",
    });
    expect(response.status).toBe(200);
    expect(recorded.first_party).toHaveLength(1);
  });

  test("refuses first_party: true from anyone but a platform administrator, before writing anything", async () => {
    reset();
    const response = await post(await appAs(false), ROUTE, {
      body: JSON.stringify({ first_party: true }),
      contentType: "application/json",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      message: "Only platform administrators may mark a connection first-party",
    });
    expect(recorded.allowed).toEqual([]);
    expect(recorded.first_party).toEqual([]);
  });

  test("refuses first_party: true for a hardcoded API server (they define no API scopes)", async () => {
    reset();
    const { getHardcodedApiServerIds } = await import("@schemavaults/app-definitions");
    const hardcodedApiServerId: string | undefined = getHardcodedApiServerIds()[0];
    if (!hardcodedApiServerId) {
      throw new Error("Expected @schemavaults/app-definitions to define a hardcoded API server");
    }
    const response = await post(await appAs(true), `/api/apis/${hardcodedApiServerId}/connect_app/${CLIENT_APP_ID}`, {
      body: JSON.stringify({ first_party: true }),
      contentType: "application/json",
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toContain("cannot be first-party");
    expect(recorded.allowed).toEqual([]);
  });

  test("rejects unknown keys in the body", async () => {
    reset();
    const response = await post(await appAs(true), ROUTE, {
      body: JSON.stringify({ first_party: true, restrict_user_scopes: true }),
      contentType: "application/json",
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error?: string }).error).toBe("validation_error");
    expect(recorded.allowed).toEqual([]);
  });

  test("answers 409 when the app is already connected, whatever the body", async () => {
    reset();
    const { ConflictError } = await import("@/lib/error/ConflictError");
    allowThrows = new ConflictError("This app is already connected to this API server");
    const response = await post(await appAs(true), ROUTE, {
      body: JSON.stringify({ first_party: true }),
      contentType: "application/json",
    });
    expect(response.status).toBe(409);
    expect(recorded.first_party).toEqual([]);
    expect(recorded.errors).toEqual([]);
  });

  test("answers 500 and records the error when marking it first-party fails (the transaction rolls back)", async () => {
    reset();
    firstPartyThrows = new Error("boom");
    const response = await post(await appAs(true), ROUTE, {
      body: JSON.stringify({ first_party: true }),
      contentType: "application/json",
    });
    expect(response.status).toBe(500);
    expect(recorded.transactions).toBe(1);
    expect(recorded.errors).toHaveLength(1);
    expect(recorded.errors[0]?.op_name).toBe("POST_connect_app_to_api.allow");
  });
});
