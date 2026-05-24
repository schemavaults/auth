// Web Crypto API
// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest

import { timingSafeEqual } from "node:crypto";
import maybeStripQuotes from "@/lib/maybeStripQuotes";

// Required environment variables for this module
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      PRIVATE_GLOBAL_PASSWORD_SALT: string;
      PRIVATE_PASSWORD_HASH_ROUNDS: string;
    }
  }
}

/**
 * Version identifiers for stored password hashes.
 * v1: global-salt only (legacy) -- iterate_sha256(salt + password + salt)
 * v2: per-user uid salt         -- iterate_sha256(salt + uid + password + uid + salt)
 *
 * Stored alongside each password row as `password_hash_version` so the verify
 * path can dispatch on the correct scheme.
 */
export const LATEST_PASSWORD_HASH_VERSION = 2 as const;
export type PasswordHashVersion = 1 | 2;

function loadSalt(): string {
  if (!process.env.PRIVATE_GLOBAL_PASSWORD_SALT) {
    throw new Error(
      "Missing PRIVATE_GLOBAL_PASSWORD_SALT environment variable",
    );
  }
  const salt: string | undefined = maybeStripQuotes(
    process.env.PRIVATE_GLOBAL_PASSWORD_SALT,
  );
  if (!salt) {
    throw new Error("Failed to load password salt!");
  }
  return salt;
}

function loadHashRounds(): number {
  if (!process.env.PRIVATE_PASSWORD_HASH_ROUNDS) {
    throw new Error(
      "Missing PRIVATE_PASSWORD_HASH_ROUNDS environment variable",
    );
  }
  let hashRounds: number;
  try {
    hashRounds = parseInt(
      maybeStripQuotes(process.env.PRIVATE_PASSWORD_HASH_ROUNDS) ?? "",
    );
    if (isNaN(hashRounds)) {
      throw new Error("PRIVATE_PASSWORD_HASH_ROUNDS is NaN");
    }
  } catch (e: unknown) {
    console.error(e);
    throw new Error(
      "Error while parsing PRIVATE_PASSWORD_HASH_ROUNDS environment variable",
    );
  }
  return hashRounds;
}

/**
 * Internal: iterate SHA-256 over a prepared pre-hash input string and return
 * the resulting digest as a lowercase hex string.
 */
async function iterateSha256Hex(secret: string): Promise<string> {
  const hashRounds: number = loadHashRounds();

  const encoder = new TextEncoder();
  const data: BufferSource = encoder.encode(secret);
  const firstHash: ArrayBuffer = await crypto.subtle.digest("SHA-256", data);

  let nextHash: ArrayBuffer = firstHash;
  for (let i: number = 0; i < hashRounds; i++) {
    nextHash = await crypto.subtle.digest("SHA-256", nextHash);
  }
  const finalPasswordHash: ArrayBuffer = nextHash;

  const hashArray: Uint8Array = new Uint8Array(finalPasswordHash);
  const hashHex: string = Array.prototype.map
    .call(hashArray, (x: number) => ("00" + x.toString(16)).slice(-2))
    .join("");

  return hashHex;
}

/**
 * Legacy (v1) password hash.
 * Kept so that users whose passwords were stored under the global-salt-only
 * scheme can still be verified at login time. Do not use this for new writes;
 * use {@link hashPasswordV2} instead.
 */
export async function hashPasswordV1(password: string): Promise<string> {
  const salt: string = loadSalt();
  const secret: string = `${salt}${password}${salt}`;
  return iterateSha256Hex(secret);
}

/**
 * Current (v2) password hash: per-user salt derived from the user's uid,
 * wrapped by the global salt (pepper) on the outside. Identical plaintext
 * passwords for different users produce different digests.
 */
export async function hashPasswordV2(
  uid: string,
  password: string,
): Promise<string> {
  if (typeof uid !== "string" || uid.length === 0) {
    throw new TypeError("hashPasswordV2: 'uid' must be a non-empty string");
  }
  const salt: string = loadSalt();
  const secret: string = `${salt}${uid}${password}${uid}${salt}`;
  return iterateSha256Hex(secret);
}

/**
 * Compatibility shim that verifies a plaintext password against a stored
 * hash under the given version. Uses a timing-safe comparison.
 */
export async function verifyPassword(opts: {
  uid: string;
  password: string;
  savedHash: string;
  version: number;
}): Promise<boolean> {
  const { uid, password, savedHash, version } = opts;

  let computedHex: string;
  switch (version) {
    case 1:
      computedHex = await hashPasswordV1(password);
      break;
    case 2:
      computedHex = await hashPasswordV2(uid, password);
      break;
    default:
      throw new Error(
        `verifyPassword: unsupported password_hash_version '${version}'`,
      );
  }

  const computedBuf: Buffer = Buffer.from(computedHex, "hex");
  const savedBuf: Buffer = Buffer.from(savedHash, "hex");
  if (computedBuf.length !== savedBuf.length) {
    return false;
  }
  return timingSafeEqual(computedBuf, savedBuf);
}

// All-zeros UUID, in the same uid-shape that real users have so the v2
// hash pre-image has the same length as a real verification call.
const DUMMY_UID = "00000000-0000-0000-0000-000000000000";
// 64-char lowercase hex (256 bits) — same shape as a real SHA-256 digest.
const DUMMY_SAVED_HASH = "0".repeat(64);

/**
 * Run a password verification against a constant dummy uid and a constant
 * dummy stored hash. The result is always `false` and is intentionally
 * discarded — the sole purpose of this call is to perform the same amount
 * of hashing work that a real {@link verifyPassword} call would perform,
 * so that the latency of the login endpoint does not depend on whether
 * the supplied email belongs to a real user. Used by `handleLogin` on the
 * "user not found" branch to close the timing side channel that
 * accompanies email-enumeration.
 */
export async function runDummyPasswordVerification(
  password: string,
): Promise<void> {
  await verifyPassword({
    uid: DUMMY_UID,
    password,
    savedHash: DUMMY_SAVED_HASH,
    version: LATEST_PASSWORD_HASH_VERSION,
  });
}
