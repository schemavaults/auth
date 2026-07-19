import { describe, test, expect, beforeEach } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  LATEST_PASSWORD_HASH_VERSION,
  hashPasswordV1,
  hashPasswordV2,
  hashPasswordV3,
  loadArgon2Params,
  parseArgon2PhcParams,
  doesStoredHashNeedUpgrade,
  verifyPassword,
  runDummyPasswordVerification,
} from "./hash_password";

const TEST_UID = "6e08f6ed-9b7e-46c8-b4bb-4109e0da1357";
const TEST_PASSWORD = "correct horse battery staple";

beforeEach(() => {
  process.env.PRIVATE_GLOBAL_PASSWORD_SALT = randomBytes(24).toString("hex");
  process.env.PRIVATE_PASSWORD_HASH_ROUNDS = "3";
  // Small argon2 cost so the suite stays fast; production defaults are
  // 64 MiB / 3 iterations.
  process.env.PRIVATE_ARGON2_MEMORY_KIB = "8192";
  process.env.PRIVATE_ARGON2_ITERATIONS = "2";
  process.env.PRIVATE_ARGON2_PARALLELISM = "1";
});

describe("hashPasswordV3 (argon2id)", () => {
  test("latest version is 3", () => {
    expect(LATEST_PASSWORD_HASH_VERSION).toBe(3);
  });

  test("produces a PHC-format argon2id string embedding the configured params", async () => {
    const hash = await hashPasswordV3(TEST_PASSWORD);
    expect(hash.startsWith("$argon2id$v=19$m=8192,t=2,p=1$")).toBe(true);
    expect(parseArgon2PhcParams(hash)).toEqual({
      memoryKib: 8192,
      iterations: 2,
      parallelism: 1,
    });
  });

  test("uses a fresh random salt per hash", async () => {
    const a = await hashPasswordV3(TEST_PASSWORD);
    const b = await hashPasswordV3(TEST_PASSWORD);
    expect(a).not.toBe(b);
  });

  test("round-trips through verifyPassword", async () => {
    const hash = await hashPasswordV3(TEST_PASSWORD);
    await expect(
      verifyPassword({
        uid: TEST_UID,
        password: TEST_PASSWORD,
        savedHash: hash,
        version: 3,
      }),
    ).resolves.toBe(true);
  });

  test("rejects a wrong password", async () => {
    const hash = await hashPasswordV3(TEST_PASSWORD);
    await expect(
      verifyPassword({
        uid: TEST_UID,
        password: "wrong password",
        savedHash: hash,
        version: 3,
      }),
    ).resolves.toBe(false);
  });

  test("rejects when the pepper (global salt) changes", async () => {
    const hash = await hashPasswordV3(TEST_PASSWORD);
    process.env.PRIVATE_GLOBAL_PASSWORD_SALT = randomBytes(24).toString("hex");
    await expect(
      verifyPassword({
        uid: TEST_UID,
        password: TEST_PASSWORD,
        savedHash: hash,
        version: 3,
      }),
    ).resolves.toBe(false);
  });

  test("a malformed stored hash fails verification instead of throwing", async () => {
    await expect(
      verifyPassword({
        uid: TEST_UID,
        password: TEST_PASSWORD,
        savedHash: "0".repeat(64),
        version: 3,
      }),
    ).resolves.toBe(false);
  });

  test("still verifies after the configured params change (self-describing hash)", async () => {
    const hash = await hashPasswordV3(TEST_PASSWORD);
    process.env.PRIVATE_ARGON2_MEMORY_KIB = "16384";
    await expect(
      verifyPassword({
        uid: TEST_UID,
        password: TEST_PASSWORD,
        savedHash: hash,
        version: 3,
      }),
    ).resolves.toBe(true);
  });
});

describe("legacy hash versions", () => {
  test("v1 hashes still verify", async () => {
    const hash = await hashPasswordV1(TEST_PASSWORD);
    await expect(
      verifyPassword({
        uid: TEST_UID,
        password: TEST_PASSWORD,
        savedHash: hash,
        version: 1,
      }),
    ).resolves.toBe(true);
  });

  test("v2 hashes still verify", async () => {
    const hash = await hashPasswordV2(TEST_UID, TEST_PASSWORD);
    await expect(
      verifyPassword({
        uid: TEST_UID,
        password: TEST_PASSWORD,
        savedHash: hash,
        version: 2,
      }),
    ).resolves.toBe(true);
    await expect(
      verifyPassword({
        uid: TEST_UID,
        password: "wrong password",
        savedHash: hash,
        version: 2,
      }),
    ).resolves.toBe(false);
  });

  test("unsupported versions throw", async () => {
    await expect(
      verifyPassword({
        uid: TEST_UID,
        password: TEST_PASSWORD,
        savedHash: "0".repeat(64),
        version: 99,
      }),
    ).rejects.toThrow();
  });
});

describe("doesStoredHashNeedUpgrade", () => {
  test("legacy versions always need an upgrade", async () => {
    const v1 = await hashPasswordV1(TEST_PASSWORD);
    const v2 = await hashPasswordV2(TEST_UID, TEST_PASSWORD);
    expect(doesStoredHashNeedUpgrade(1, v1)).toBe(true);
    expect(doesStoredHashNeedUpgrade(2, v2)).toBe(true);
  });

  test("a v3 hash with current params does not need an upgrade", async () => {
    const hash = await hashPasswordV3(TEST_PASSWORD);
    expect(doesStoredHashNeedUpgrade(3, hash)).toBe(false);
  });

  test("a v3 hash needs a re-hash after the configured params change", async () => {
    const hash = await hashPasswordV3(TEST_PASSWORD);
    process.env.PRIVATE_ARGON2_ITERATIONS = "3";
    expect(doesStoredHashNeedUpgrade(3, hash)).toBe(true);
  });

  test("a malformed v3 hash is flagged for re-hash", () => {
    expect(doesStoredHashNeedUpgrade(3, "0".repeat(64))).toBe(true);
  });
});

describe("loadArgon2Params", () => {
  test("falls back to defaults when the env vars are unset", () => {
    delete process.env.PRIVATE_ARGON2_MEMORY_KIB;
    delete process.env.PRIVATE_ARGON2_ITERATIONS;
    delete process.env.PRIVATE_ARGON2_PARALLELISM;
    expect(loadArgon2Params()).toEqual({
      memoryKib: 65536,
      iterations: 3,
      parallelism: 1,
    });
  });

  test("rejects non-positive or non-numeric overrides", () => {
    process.env.PRIVATE_ARGON2_MEMORY_KIB = "0";
    expect(() => loadArgon2Params()).toThrow();
    process.env.PRIVATE_ARGON2_MEMORY_KIB = "lots";
    expect(() => loadArgon2Params()).toThrow();
  });
});

describe("runDummyPasswordVerification", () => {
  test("performs a v3-cost verification without throwing", async () => {
    await expect(
      runDummyPasswordVerification("some candidate password"),
    ).resolves.toBeUndefined();
  });
});
