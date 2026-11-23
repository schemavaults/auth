import { describe, expect, test } from "bun:test";
import { endSessionOfReusedRefreshToken } from "./end-session-of-reused-refresh-token";

const UID = "55555555-5555-4555-8555-555555555555";
const NOW = 1_700_000_000_000;
const GRACE_MS = 10_000;
const PRESENTED = "22222222-2222-4222-8222-222222222222";
const LIVE_REFRESH = "33333333-3333-4333-8333-333333333333";
const ACCESS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

interface Update {
  set: unknown;
  where: unknown[][];
}

/**
 * Stands in for the transaction: the compare-and-set UPDATE claiming the
 * presented token's rotation revocation (executeTakeFirst, `claimed_rows`
 * rows), then the statements of revokeTokensIssuedWithRefreshToken (the
 * presented token's issuance row, the session's tokens, the UPDATE ending
 * grace windows and the INSERT of the revocations).
 */
function fakeDb(claimed_rows: number) {
  const updates: Update[] = [];
  const inserts: unknown[] = [];
  let transactions = 0;
  const eb = Object.assign(() => null, { or: () => null });
  const trx = {
    selectFrom() {
      const builder = {
        leftJoin: () => builder,
        select: () => builder,
        where(...args: unknown[]) {
          if (typeof args[0] === "function") (args[0] as (e: typeof eb) => unknown)(eb);
          return builder;
        },
        executeTakeFirst: async () => ({ session_id: PRESENTED, refresh_jti: null }),
        execute: async () => [
          { jti: LIVE_REFRESH, expires_at: NOW + 60_000, token_type: "refresh", revoked_jti: null, revocation_reason: null },
          { jti: ACCESS, expires_at: NOW + 5_000, token_type: "access", revoked_jti: null, revocation_reason: null },
        ],
      };
      return builder;
    },
    updateTable() {
      const update: Update = { set: undefined, where: [] };
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
        executeTakeFirst: async () => ({ numUpdatedRows: BigInt(claimed_rows) }),
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
  const db = {
    transaction: () => ({
      execute: async <T>(fn: (t: typeof trx) => Promise<T>): Promise<T> => {
        transactions += 1;
        return fn(trx);
      },
    }),
  };
  return {
    db: db as never,
    updates,
    inserts,
    get transactions() {
      return transactions;
    },
  };
}

describe("endSessionOfReusedRefreshToken", () => {
  test("claims a rotation revocation older than the grace window and ends its whole session", async () => {
    const fake = fakeDb(1);

    const ended = await endSessionOfReusedRefreshToken(fake.db, {
      jti: PRESENTED,
      uid: UID,
      rotation_reuse_grace_ms: GRACE_MS,
      now: NOW,
    });

    expect(ended).toEqual({ revoked_tokens: 2 });
    expect(fake.transactions).toBe(1);
    // The claim: only this token's rotation revocation, only once its grace
    // window is over.
    expect(fake.updates[0]).toEqual({
      set: { reason: null },
      where: [
        ["jti", "=", PRESENTED],
        ["uid", "=", UID],
        ["reason", "=", "rotation"],
        ["revoked_at", "<=", NOW - GRACE_MS],
      ],
    });
    // The live refresh token the other party holds dies with the session.
    expect(fake.inserts).toEqual([
      [
        { jti: LIVE_REFRESH, uid: UID, expires_at: NOW + 60_000, revoked_at: NOW, reason: null },
        { jti: ACCESS, uid: UID, expires_at: NOW + 5_000, revoked_at: NOW, reason: null },
      ],
    ]);
  });

  test("ends nothing when the revocation is not a rotation outside the grace window, or was already claimed", async () => {
    const fake = fakeDb(0);

    const ended = await endSessionOfReusedRefreshToken(fake.db, {
      jti: PRESENTED,
      uid: UID,
      rotation_reuse_grace_ms: GRACE_MS,
      now: NOW,
    });

    expect(ended).toBeNull();
    expect(fake.updates).toHaveLength(1);
    expect(fake.inserts).toEqual([]);
  });

  test("rejects malformed input before touching the database", async () => {
    const fake = fakeDb(1);
    const options = { jti: PRESENTED, uid: UID, rotation_reuse_grace_ms: GRACE_MS, now: NOW };
    await expect(endSessionOfReusedRefreshToken(fake.db, { ...options, jti: "nope" })).rejects.toThrow(TypeError);
    await expect(endSessionOfReusedRefreshToken(fake.db, { ...options, uid: "nope" })).rejects.toThrow(TypeError);
    await expect(
      endSessionOfReusedRefreshToken(fake.db, { ...options, rotation_reuse_grace_ms: Number.NaN }),
    ).rejects.toThrow(TypeError);
    expect(fake.transactions).toBe(0);
  });
});
