import { describe, expect, test } from "bun:test";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import { recordImplicitConsentForGrant } from "./record-implicit-consent";

const UID = "55555555-5555-4555-8555-555555555555";
const APP_ID = "e2e-first-party-app";
const API_SERVER_ID = "e2e-notes-api";

interface Recorded {
  selects: { table: string; where: unknown[][] }[];
  inserts: { table: string; values: unknown }[];
  transactions: number;
}

/**
 * Just enough of Kysely for the recorder: the policy lookup answers
 * `first_party`, the scope lookup answers the API server's definitions,
 * inserts are recorded (and the consent insert returns every row).
 */
function fakeDb({
  first_party,
  defined = [],
}: {
  first_party: boolean | null;
  defined?: { api_server_scope_id: string; scope: string }[];
}): { db: never; recorded: Recorded } {
  const recorded: Recorded = { selects: [], inserts: [], transactions: 0 };
  const build = (isTransaction: boolean) => {
    const db = {
      isTransaction,
      selectFrom(table: string) {
        const select = { table, where: [] as unknown[][] };
        recorded.selects.push(select);
        const builder = {
          where(...args: unknown[]) {
            select.where.push(args);
            return builder;
          },
          select() {
            return builder;
          },
          async executeTakeFirst() {
            return table === "app_api_scope_policies" && first_party !== null
              ? { first_party }
              : undefined;
          },
          async execute() {
            if (table !== "api_server_scopes") return [];
            const values = (select.where.find((w) => w[0] === "scope")?.[2] ?? []) as string[];
            return defined.filter((d) => values.includes(d.scope));
          },
        };
        return builder;
      },
      insertInto(table: string) {
        let values: unknown;
        const builder = {
          values(v: unknown) {
            values = v;
            recorded.inserts.push({ table, values: v });
            return builder;
          },
          onConflict() {
            return builder;
          },
          returning() {
            return builder;
          },
          async execute() {
            return Array.isArray(values) ? values : [];
          },
        };
        return builder;
      },
      transaction() {
        return {
          async execute<T>(fn: (trx: unknown) => Promise<T>): Promise<T> {
            recorded.transactions += 1;
            return await fn(build(true));
          },
        };
      },
    };
    return db;
  };
  return { db: build(false) as never, recorded };
}

const DEFINED = [
  { api_server_scope_id: "11111111-1111-4111-8111-111111111111", scope: "notes:read" },
  { api_server_scope_id: "22222222-2222-4222-8222-222222222222", scope: "notes:write" },
];

describe("recordImplicitConsentForGrant", () => {
  test("authorizes the app and records the grant's API scopes through a first-party connection", async () => {
    const fake = fakeDb({ first_party: true, defined: DEFINED });
    const recorded = await recordImplicitConsentForGrant(fake.db, {
      uid: UID,
      client_app_id: APP_ID,
      grant: { scope: "openid email notes:read notes:write", scope_api_server_id: API_SERVER_ID },
    });
    expect(recorded).toBe(true);
    expect(fake.recorded.transactions).toBe(1);
    expect(fake.recorded.inserts.map((i) => i.table)).toEqual([
      "authorized_apps",
      "user_app_scope_consents",
    ]);
    expect(fake.recorded.inserts[0]!.values).toMatchObject({ app_id: APP_ID, uid: UID });
    const consents = fake.recorded.inserts[1]!.values as Record<string, unknown>[];
    expect(consents.map((c) => c.api_server_scope_id)).toEqual(DEFINED.map((d) => d.api_server_scope_id));
    expect(consents.every((c) => c.uid === UID && c.client_app_id === APP_ID && c.api_server_id === API_SERVER_ID)).toBe(true);
    // The OIDC scopes are never looked up as API scopes.
    const scopeLookup = fake.recorded.selects.find((s) => s.table === "api_server_scopes");
    expect(scopeLookup?.where).toContainEqual(["scope", "in", ["notes:read", "notes:write"]]);
  });

  test("records nothing when the connection is not first-party", async () => {
    for (const first_party of [false, null]) {
      const fake = fakeDb({ first_party, defined: DEFINED });
      expect(
        await recordImplicitConsentForGrant(fake.db, {
          uid: UID,
          client_app_id: APP_ID,
          grant: { scope: "openid notes:read", scope_api_server_id: API_SERVER_ID },
        }),
      ).toBe(false);
      expect(fake.recorded.inserts).toEqual([]);
      expect(fake.recorded.transactions).toBe(0);
    }
  });

  test("records nothing (and looks nothing up) for a grant without API scopes", async () => {
    for (const grant of [
      { scope: "openid email", scope_api_server_id: null },
      { scope: null, scope_api_server_id: null },
      { scope: "openid email", scope_api_server_id: API_SERVER_ID },
    ]) {
      const fake = fakeDb({ first_party: true, defined: DEFINED });
      expect(await recordImplicitConsentForGrant(fake.db, { uid: UID, client_app_id: APP_ID, grant })).toBe(false);
      expect(fake.recorded.selects).toEqual([]);
      expect(fake.recorded.inserts).toEqual([]);
    }
  });

  test("never records anything for the auth server's own app", async () => {
    const fake = fakeDb({ first_party: true, defined: DEFINED });
    expect(
      await recordImplicitConsentForGrant(fake.db, {
        uid: UID,
        client_app_id: getAuthServerAppId(),
        grant: { scope: "openid notes:read", scope_api_server_id: API_SERVER_ID },
      }),
    ).toBe(false);
    expect(fake.recorded.selects).toEqual([]);
    expect(fake.recorded.inserts).toEqual([]);
  });

  test("joins the caller's transaction instead of opening a nested one", async () => {
    const fake = fakeDb({ first_party: true, defined: DEFINED });
    const trx = await (fake.db as unknown as { transaction: () => { execute: <T>(fn: (trx: never) => Promise<T>) => Promise<T> } })
      .transaction()
      .execute(async (inner) => inner);
    fake.recorded.transactions = 0;
    expect(
      await recordImplicitConsentForGrant(trx, {
        uid: UID,
        client_app_id: APP_ID,
        grant: { scope: "notes:read", scope_api_server_id: API_SERVER_ID },
      }),
    ).toBe(true);
    expect(fake.recorded.transactions).toBe(0);
    expect(fake.recorded.inserts.map((i) => i.table)).toEqual([
      "authorized_apps",
      "user_app_scope_consents",
    ]);
  });
});
