import { describe, expect, it, mock } from "bun:test";

// The cache module reads the watermark through this helper; stub it so the
// test never needs Postgres.
const dbReads: string[] = [];
let dbWatermark = 0;
mock.module("@/lib/auth-db/users/get-user-tokens-valid-after", () => ({
  getUserTokensValidAfter: async (_db: unknown, uid: string) => {
    dbReads.push(uid);
    return dbWatermark;
  },
}));

const {
  getUserTokensValidAfterCached,
  invalidateUserTokensValidAfterCache,
  userTokensValidAfterCacheKey,
  USER_TOKENS_VALID_AFTER_CACHE_TTL_SECONDS,
} = await import("./user-tokens-valid-after-cache");

const UID = "44444444-4444-4444-8444-444444444444";
const db = {} as never;

interface FakeRedisCall {
  op: "get" | "set" | "del";
  args: unknown[];
}

function fakeRedis(store: Map<string, string>, opts?: { fail?: boolean }) {
  const calls: FakeRedisCall[] = [];
  const client = {
    get: async (key: string) => {
      calls.push({ op: "get", args: [key] });
      if (opts?.fail) throw new Error("redis down");
      return store.get(key) ?? null;
    },
    set: async (key: string, value: string, ...rest: unknown[]) => {
      calls.push({ op: "set", args: [key, value, ...rest] });
      if (opts?.fail) throw new Error("redis down");
      store.set(key, value);
      return "OK";
    },
    del: async (key: string) => {
      calls.push({ op: "del", args: [key] });
      if (opts?.fail) throw new Error("redis down");
      return store.delete(key) ? 1 : 0;
    },
  };
  return { redis: { client } as never, calls, store };
}

describe("getUserTokensValidAfterCached", () => {
  it("reads the database without Redis", async () => {
    dbReads.length = 0;
    dbWatermark = 123;
    expect(await getUserTokensValidAfterCached(db, UID)).toBe(123);
    expect(dbReads).toEqual([UID]);
  });

  it("fills the cache with a TTL on a miss and serves the hit without the database", async () => {
    dbReads.length = 0;
    dbWatermark = 456;
    const { redis, calls, store } = fakeRedis(new Map());

    expect(await getUserTokensValidAfterCached(db, UID, redis)).toBe(456);
    expect(dbReads).toEqual([UID]);
    const set = calls.find((c) => c.op === "set");
    expect(set?.args).toEqual([
      userTokensValidAfterCacheKey(UID),
      "456",
      "EX",
      USER_TOKENS_VALID_AFTER_CACHE_TTL_SECONDS,
    ]);
    expect(store.get(userTokensValidAfterCacheKey(UID))).toBe("456");

    dbWatermark = 999; // must NOT be observed while the cache is warm
    expect(await getUserTokensValidAfterCached(db, UID, redis)).toBe(456);
    expect(dbReads).toEqual([UID]);
  });

  it("re-reads the database after the key is invalidated", async () => {
    dbReads.length = 0;
    dbWatermark = 1;
    const { redis } = fakeRedis(new Map());
    expect(await getUserTokensValidAfterCached(db, UID, redis)).toBe(1);
    dbWatermark = 2;
    await invalidateUserTokensValidAfterCache(redis, UID);
    expect(await getUserTokensValidAfterCached(db, UID, redis)).toBe(2);
    expect(dbReads).toEqual([UID, UID]);
  });

  it("falls back to the database when Redis fails", async () => {
    dbReads.length = 0;
    dbWatermark = 77;
    const { redis } = fakeRedis(new Map(), { fail: true });
    expect(await getUserTokensValidAfterCached(db, UID, redis)).toBe(77);
    expect(dbReads).toEqual([UID]);
  });

  it("ignores a corrupt cached value", async () => {
    dbReads.length = 0;
    dbWatermark = 5;
    const store = new Map([[userTokensValidAfterCacheKey(UID), "garbage"]]);
    const { redis } = fakeRedis(store);
    expect(await getUserTokensValidAfterCached(db, UID, redis)).toBe(5);
    expect(dbReads).toEqual([UID]);
  });

  it("invalidation never throws", async () => {
    const { redis } = fakeRedis(new Map(), { fail: true });
    await expect(
      invalidateUserTokensValidAfterCache(redis, UID),
    ).resolves.toBeUndefined();
    await expect(
      invalidateUserTokensValidAfterCache(null, UID),
    ).resolves.toBeUndefined();
  });

  it("rejects an invalid uid", () => {
    expect(() => userTokensValidAfterCacheKey("nope")).toThrow(TypeError);
  });
});
