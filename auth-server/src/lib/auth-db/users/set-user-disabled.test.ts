import { describe, expect, test } from "bun:test";
import { DISABLED_USER_TOKENS_VALID_AFTER } from "./is-token-iat-revoked";
import { setUserDisabled, UserNotFoundError } from "./set-user-disabled";

const UID = "55555555-5555-4555-8555-555555555555";

interface RecordedUpdate {
  table: string;
  set: Record<string, unknown>;
  where: unknown[][];
}

/**
 * Records the UPDATEs setUserDisabled issues through the Kysely builder
 * chain (transaction → updateTable → set → where… → executeTakeFirst).
 */
function fakeDb(opts: { numUpdatedRows?: number } = {}) {
  const updates: RecordedUpdate[] = [];
  let transactions = 0;
  const trx = {
    updateTable(table: string) {
      const update: RecordedUpdate = { table, set: {}, where: [] };
      updates.push(update);
      const builder = {
        set(values: Record<string, unknown>) {
          update.set = values;
          return builder;
        },
        where(...args: unknown[]) {
          update.where.push(args);
          return builder;
        },
        async executeTakeFirst() {
          return { numUpdatedRows: BigInt(opts.numUpdatedRows ?? 1) };
        },
      };
      return builder;
    },
  };
  const db = {
    transaction: () => ({
      execute: async <T>(fn: (t: typeof trx) => Promise<T>): Promise<T> => {
        transactions++;
        return await fn(trx);
      },
    }),
  };
  return {
    db: db as never,
    updates,
    get transactions() {
      return transactions;
    },
  };
}

describe("setUserDisabled", () => {
  test("disabling pins the tokens_valid_after watermark in the same UPDATE", async () => {
    const fake = fakeDb();
    await setUserDisabled(fake.db, UID, true);

    expect(fake.transactions).toBe(1);
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]).toEqual({
      table: "users",
      set: {
        disabled: true,
        tokens_valid_after: DISABLED_USER_TOKENS_VALID_AFTER,
      },
      where: [["uid", "=", UID]],
    });
  });

  test("re-enabling unpins a pinned watermark to the current time, in the same transaction", async () => {
    const fake = fakeDb();
    const before = Math.floor(Date.now() / 1000);
    await setUserDisabled(fake.db, UID, false);
    const after = Math.floor(Date.now() / 1000);

    expect(fake.transactions).toBe(1);
    expect(fake.updates).toHaveLength(2);
    expect(fake.updates[0]).toEqual({
      table: "users",
      set: { disabled: false },
      where: [["uid", "=", UID]],
    });

    const unpin = fake.updates[1]!;
    expect(unpin.table).toBe("users");
    // Only a pinned watermark moves: re-enabling an account that is not
    // disabled must not end its sessions.
    expect(unpin.where).toEqual([
      ["uid", "=", UID],
      ["tokens_valid_after", ">=", DISABLED_USER_TOKENS_VALID_AFTER],
    ]);
    const watermark = unpin.set.tokens_valid_after as number;
    expect(Object.keys(unpin.set)).toEqual(["tokens_valid_after"]);
    expect(watermark).toBeGreaterThanOrEqual(before);
    expect(watermark).toBeLessThanOrEqual(after);
    expect(watermark).toBeLessThan(DISABLED_USER_TOKENS_VALID_AFTER);
  });

  test("throws UserNotFoundError (and writes no watermark) for an unknown uid", async () => {
    for (const disabled of [true, false]) {
      const fake = fakeDb({ numUpdatedRows: 0 });
      await expect(setUserDisabled(fake.db, UID, disabled)).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
      expect(fake.updates).toHaveLength(1);
    }
  });

  test("rejects a malformed uid before touching the database", async () => {
    const fake = fakeDb();
    await expect(setUserDisabled(fake.db, "not-a-uuid", true)).rejects.toThrow();
    expect(fake.transactions).toBe(0);
  });
});
