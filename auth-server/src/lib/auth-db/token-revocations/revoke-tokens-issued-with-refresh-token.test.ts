import { describe, expect, test } from "bun:test";
import { revokeTokensIssuedWithRefreshToken } from "./revoke-tokens-issued-with-refresh-token";

const UID = "55555555-5555-4555-8555-555555555555";
const NOW = 1_700_000_000_000;
const SESSION = "00000000-0000-4000-8000-000000000000";
const PRESENTED = "22222222-2222-4222-8222-222222222222";

interface SessionTokenRow {
  jti: string;
  expires_at: number | string;
  token_type: "access" | "refresh";
  revoked_jti: string | null;
  revocation_reason: "rotation" | null;
}

/**
 * Stands in for the three statements the revocation issues: the lookup of
 * the presented refresh token's issuance row (executeTakeFirst), the SELECT
 * of the session's tokens (execute), the UPDATE that ends rotation grace
 * windows and the INSERT of the revocations.
 */
function fakeDb(presented_row: { session_id: string | null; refresh_jti: string | null } | undefined, session_tokens: SessionTokenRow[]) {
  const session_filters: { column: string; values: unknown }[] = [];
  const wheres: unknown[][] = [];
  const updates: { set: unknown; where: unknown[][] }[] = [];
  const inserts: unknown[] = [];
  const eb = Object.assign(
    (column: string, _op: string, values: unknown) => {
      session_filters.push({ column, values });
      return null;
    },
    { or: () => null },
  );
  const db = {
    selectFrom() {
      const builder = {
        leftJoin: () => builder,
        select: () => builder,
        where(...args: unknown[]) {
          if (typeof args[0] === "function") {
            (args[0] as (e: typeof eb) => unknown)(eb);
          } else {
            wheres.push(args);
          }
          return builder;
        },
        executeTakeFirst: async () => presented_row,
        execute: async () => session_tokens,
      };
      return builder;
    },
    updateTable() {
      const update = { set: undefined as unknown, where: [] as unknown[][] };
      updates.push(update);
      const builder = {
        set(values: unknown) {
          update.set = values;
          return builder;
        },
        where(...args: unknown[]) {
          update.where.push(args);
          return builder;
        },
        execute: async () => [],
      };
      return builder;
    },
    insertInto() {
      const builder = {
        values(values: unknown) {
          inserts.push(values);
          return builder;
        },
        onConflict: () => builder,
        execute: async () => [],
      };
      return builder;
    },
  };
  return { db: db as never, session_filters, wheres, updates, inserts };
}

describe("revokeTokensIssuedWithRefreshToken", () => {
  test("revokes the tokens of the presented refresh token's whole session, not only those minted with it", async () => {
    const fake = fakeDb({ session_id: SESSION, refresh_jti: null }, [
      // access token of an earlier refresh cycle
      { jti: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expires_at: NOW + 5_000, token_type: "access", revoked_jti: null, revocation_reason: null },
      // delegated token exchanged for it (bigint columns can come back as strings)
      { jti: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", expires_at: String(NOW + 4_000), token_type: "access", revoked_jti: null, revocation_reason: null },
      // the session's first refresh token, rotated away
      { jti: SESSION, expires_at: NOW + 9_000, token_type: "refresh", revoked_jti: SESSION, revocation_reason: "rotation" },
      // already revoked for good: left alone
      { jti: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", expires_at: NOW + 1_000, token_type: "access", revoked_jti: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", revocation_reason: null },
    ]);

    const revoked = await revokeTokensIssuedWithRefreshToken(fake.db, PRESENTED, UID, NOW);

    expect(revoked).toBe(2);
    // The session is the presented token's recorded one; rows from before
    // sessions were recorded are still found by `refresh_jti`.
    expect(fake.session_filters).toEqual([
      { column: "issued_tokens.session_id", values: [SESSION, PRESENTED] },
      { column: "issued_tokens.refresh_jti", values: [SESSION, PRESENTED] },
    ]);
    expect(fake.wheres).toContainEqual(["issued_tokens.uid", "=", UID]);
    expect(fake.wheres).toContainEqual(["issued_tokens.expires_at", ">", NOW]);
    expect(fake.inserts).toEqual([
      [
        { jti: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", uid: UID, expires_at: NOW + 5_000, revoked_at: NOW, reason: null },
        { jti: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", uid: UID, expires_at: NOW + 4_000, revoked_at: NOW, reason: null },
      ],
    ]);
    // Rotated refresh tokens of the session (and the presented one, should
    // a rotation have revoked it) lose their reuse grace window.
    expect(fake.updates).toEqual([
      {
        set: { reason: null },
        where: [
          ["uid", "=", UID],
          ["jti", "in", [PRESENTED, SESSION]],
          ["reason", "=", "rotation"],
        ],
      },
    ]);
  });

  test("a refresh token with no issuance row is its own session", async () => {
    const fake = fakeDb(undefined, []);

    const revoked = await revokeTokensIssuedWithRefreshToken(fake.db, PRESENTED, UID, NOW);

    expect(revoked).toBe(0);
    expect(fake.session_filters[0]).toEqual({
      column: "issued_tokens.session_id",
      values: [PRESENTED, PRESENTED],
    });
    expect(fake.inserts).toEqual([]);
  });

  test("rejects malformed ids before touching the database", async () => {
    const fake = fakeDb(undefined, []);
    await expect(revokeTokensIssuedWithRefreshToken(fake.db, "nope", UID, NOW)).rejects.toThrow(TypeError);
    await expect(revokeTokensIssuedWithRefreshToken(fake.db, PRESENTED, "nope", NOW)).rejects.toThrow(TypeError);
    expect(fake.updates).toEqual([]);
  });
});
