import { describe, expect, test } from "bun:test";
import { revokeTokensIssuedToClientApp } from "./revoke-tokens-issued-to-client-app";

const UID = "55555555-5555-4555-8555-555555555555";
const APP_ID = "e2e-third-party-app";
const NOW = 1_700_000_000_000;

interface IssuedRow {
  jti: string;
  expires_at: number | string;
}

/**
 * Records the SELECT on issued_tokens (selectFrom → leftJoin → select →
 * where… → execute) and the INSERT into token_revocations (insertInto →
 * values → onConflict → execute) that revokeTokensIssuedToClientApp issues.
 */
function fakeDb(issued: IssuedRow[]) {
  const selects: { table: string; leftJoin: unknown[][]; where: unknown[][] }[] = [];
  const inserts: { table: string; values: unknown }[] = [];
  const db = {
    selectFrom(table: string) {
      const select = { table, leftJoin: [] as unknown[][], where: [] as unknown[][] };
      selects.push(select);
      const builder = {
        leftJoin(...args: unknown[]) {
          select.leftJoin.push(args);
          return builder;
        },
        select() {
          return builder;
        },
        where(...args: unknown[]) {
          select.where.push(args);
          return builder;
        },
        async execute() {
          return issued;
        },
      };
      return builder;
    },
    insertInto(table: string) {
      const insert = { table, values: undefined as unknown };
      inserts.push(insert);
      const builder = {
        values(values: unknown) {
          insert.values = values;
          return builder;
        },
        onConflict() {
          return builder;
        },
        async execute() {
          return [];
        },
      };
      return builder;
    },
  };
  return { db: db as never, selects, inserts };
}

describe("revokeTokensIssuedToClientApp", () => {
  test("revokes every unexpired, not yet revoked token issued to the app for the user, immediately", async () => {
    const fake = fakeDb([
      { jti: "11111111-1111-4111-8111-111111111111", expires_at: NOW + 5_000 },
      // bigint columns can come back as strings
      { jti: "22222222-2222-4222-8222-222222222222", expires_at: String(NOW + 9_000) },
    ]);

    const revoked = await revokeTokensIssuedToClientApp(fake.db, UID, APP_ID, NOW);

    expect(revoked).toBe(2);
    expect(fake.selects).toEqual([
      {
        table: "issued_tokens",
        leftJoin: [["token_revocations", "token_revocations.jti", "issued_tokens.jti"]],
        where: [
          ["issued_tokens.uid", "=", UID],
          ["issued_tokens.client_app_id", "=", APP_ID],
          ["issued_tokens.expires_at", ">", NOW],
          ["token_revocations.jti", "is", null],
        ],
      },
    ]);
    expect(fake.inserts).toEqual([
      {
        table: "token_revocations",
        values: [
          {
            jti: "11111111-1111-4111-8111-111111111111",
            uid: UID,
            expires_at: NOW + 5_000,
            revoked_at: NOW,
            reason: null,
          },
          {
            jti: "22222222-2222-4222-8222-222222222222",
            uid: UID,
            expires_at: NOW + 9_000,
            revoked_at: NOW,
            reason: null,
          },
        ],
      },
    ]);
  });

  test("inserts nothing when no unexpired token is tracked", async () => {
    const fake = fakeDb([]);
    expect(await revokeTokensIssuedToClientApp(fake.db, UID, APP_ID, NOW)).toBe(0);
    expect(fake.inserts).toEqual([]);
  });

  test("rejects a malformed uid or app id before querying", async () => {
    const fake = fakeDb([]);
    await expect(revokeTokensIssuedToClientApp(fake.db, "not-a-uuid", APP_ID, NOW)).rejects.toThrow(TypeError);
    await expect(revokeTokensIssuedToClientApp(fake.db, UID, "bad app id", NOW)).rejects.toThrow(TypeError);
    expect(fake.selects).toEqual([]);
  });
});
