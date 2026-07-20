// Web Crypto API
// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest

import { randomBytes, timingSafeEqual } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";
import maybeStripQuotes from "@/lib/maybeStripQuotes";

// Required environment variables for this module
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      PRIVATE_GLOBAL_PASSWORD_SALT: string;
      PRIVATE_PASSWORD_HASH_ROUNDS: string;
      // Optional argon2id (v3) tuning parameters; see loadArgon2Params()
      PRIVATE_ARGON2_MEMORY_KIB?: string;
      PRIVATE_ARGON2_ITERATIONS?: string;
      PRIVATE_ARGON2_PARALLELISM?: string;
    }
  }
}

/**
 * Version identifiers for stored password hashes.
 * v1: global-salt only (legacy) -- iterate_sha256(salt + password + salt)
 * v2: per-user uid salt (legacy) -- iterate_sha256(salt + uid + password + uid + salt)
 * v3: argon2id (memory-hard)     -- argon2id(password, random per-hash salt,
 *                                   secret = global pepper), stored as a
 *                                   self-describing PHC string
 *
 * Stored alongside each password row as `password_hash_version` so the verify
 * path can dispatch on the correct scheme.
 */
export const LATEST_PASSWORD_HASH_VERSION = 3 as const;
export type PasswordHashVersion = 1 | 2 | 3;

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
 * use {@link hashPasswordV3} instead.
 */
export async function hashPasswordV1(password: string): Promise<string> {
  const salt: string = loadSalt();
  const secret: string = `${salt}${password}${salt}`;
  return iterateSha256Hex(secret);
}

/**
 * Legacy (v2) password hash: per-user salt derived from the user's uid,
 * wrapped by the global salt (pepper) on the outside. Kept only so that
 * passwords stored under v2 can still be verified at login time (and then
 * lazily upgraded). Do not use this for new writes; use
 * {@link hashPasswordV3} instead.
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
 * Argon2id (v3) parameters. Iterated SHA-256 (v1/v2) is cheap to attack on
 * GPUs/ASICs; argon2id is memory-hard, so each guess costs the attacker
 * `memoryKib` of RAM bandwidth in addition to compute.
 */
export interface Argon2Params {
  /** Memory cost in KiB. */
  memoryKib: number;
  /** Number of passes over memory (time cost). */
  iterations: number;
  /** Degree of parallelism (lanes). */
  parallelism: number;
}

/**
 * Defaults follow the finding/OWASP guidance for server-side interactive
 * logins: m=64 MiB, t=3, p=1. Overridable per-deployment via the
 * PRIVATE_ARGON2_* environment variables (values are read at call time, and
 * stored hashes self-describe their parameters, so tuning is safe: existing
 * hashes still verify and are transparently re-hashed on next login).
 */
const DEFAULT_ARGON2_MEMORY_KIB = 64 * 1024;
const DEFAULT_ARGON2_ITERATIONS = 3;
const DEFAULT_ARGON2_PARALLELISM = 1;

/** Random per-hash salt length, in bytes. */
const ARGON2_SALT_BYTES = 16;
/** Derived digest length, in bytes. */
const ARGON2_HASH_BYTES = 32;

function loadOptionalPositiveIntEnv(
  name: string,
  fallback: number,
): number {
  const raw: string | undefined = maybeStripQuotes(process.env[name]);
  if (!raw) {
    return fallback;
  }
  const parsed: number = parseInt(raw);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer (got '${raw}')`);
  }
  return parsed;
}

export function loadArgon2Params(): Argon2Params {
  return {
    memoryKib: loadOptionalPositiveIntEnv(
      "PRIVATE_ARGON2_MEMORY_KIB",
      DEFAULT_ARGON2_MEMORY_KIB,
    ),
    iterations: loadOptionalPositiveIntEnv(
      "PRIVATE_ARGON2_ITERATIONS",
      DEFAULT_ARGON2_ITERATIONS,
    ),
    parallelism: loadOptionalPositiveIntEnv(
      "PRIVATE_ARGON2_PARALLELISM",
      DEFAULT_ARGON2_PARALLELISM,
    ),
  };
}

/**
 * Current (v3) password hash: argon2id with a random per-hash salt and the
 * global salt env var applied as the argon2 keyed-hashing secret (pepper, per
 * RFC 9106), so a database-only exfiltration cannot even begin an offline
 * cracking attempt without the server-side env secret. Returns a PHC-format
 * encoded string (`$argon2id$v=19$m=...,t=...,p=...$<salt>$<digest>`) that
 * self-describes its salt and cost parameters.
 */
export async function hashPasswordV3(password: string): Promise<string> {
  const pepper: string = loadSalt();
  const params: Argon2Params = loadArgon2Params();
  return argon2id({
    password,
    salt: randomBytes(ARGON2_SALT_BYTES),
    secret: pepper,
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memoryKib,
    hashLength: ARGON2_HASH_BYTES,
    outputType: "encoded",
  });
}

/**
 * Parse the cost parameters out of a PHC-format argon2id string produced by
 * {@link hashPasswordV3}. Returns null when the string is not a well-formed
 * argon2id PHC string.
 */
export function parseArgon2PhcParams(savedHash: string): Argon2Params | null {
  const match = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(
    savedHash,
  );
  if (!match) {
    return null;
  }
  return {
    memoryKib: parseInt(match[1]!),
    iterations: parseInt(match[2]!),
    parallelism: parseInt(match[3]!),
  };
}

/**
 * Whether a stored hash should be re-hashed under the current scheme and
 * parameters. True for any pre-v3 hash, and for v3 hashes whose embedded cost
 * parameters (or format) no longer match the currently configured
 * PRIVATE_ARGON2_* values -- so strengthening the parameters transparently
 * re-hashes everyone on their next successful login.
 */
export function doesStoredHashNeedUpgrade(
  version: number,
  savedHash: string,
): boolean {
  if (version < LATEST_PASSWORD_HASH_VERSION) {
    return true;
  }
  const stored: Argon2Params | null = parseArgon2PhcParams(savedHash);
  if (!stored) {
    return true;
  }
  const current: Argon2Params = loadArgon2Params();
  return (
    stored.memoryKib !== current.memoryKib ||
    stored.iterations !== current.iterations ||
    stored.parallelism !== current.parallelism
  );
}

/**
 * Compatibility shim that verifies a plaintext password against a stored
 * hash under the given version. Uses a timing-safe comparison for the legacy
 * fixed-length hex digests; v3 recomputes argon2id from the stored PHC
 * string's own salt and parameters (so previously stored hashes keep
 * verifying after the PRIVATE_ARGON2_* configuration changes).
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
    case 3: {
      const pepper: string = loadSalt();
      try {
        return await argon2Verify({
          password,
          secret: pepper,
          hash: savedHash,
        });
      } catch (e: unknown) {
        // A malformed stored hash is a failed login, not a server error --
        // mirrors the length-mismatch handling on the legacy hex path.
        console.error(
          "[verifyPassword] Failed to verify v3 (argon2id) password hash: ",
          e,
        );
        return false;
      }
    }
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

// Constant input for the dummy verification hash. Not a secret: the dummy
// verification result is always discarded, so it does not matter whether an
// attacker knows (or even submits) this exact string.
const DUMMY_PASSWORD = "schemavaults-dummy-password-verification";
// Fixed all-zeros salt so the dummy hash is deterministic for a given
// parameter set; the salt only needs to be random for hashes that get stored.
const DUMMY_SALT = Buffer.alloc(ARGON2_SALT_BYTES);

// Cache of the dummy PHC hash, keyed by the parameter set it was computed
// under so a runtime parameter change (or a test overriding the env vars)
// invalidates it naturally.
let cachedDummyHash: { key: string; phc: Promise<string> } | null = null;

function getDummyPhcHash(): Promise<string> {
  const params: Argon2Params = loadArgon2Params();
  const key: string = `m=${params.memoryKib},t=${params.iterations},p=${params.parallelism}`;
  if (cachedDummyHash?.key !== key) {
    cachedDummyHash = {
      key,
      phc: argon2id({
        password: DUMMY_PASSWORD,
        salt: DUMMY_SALT,
        secret: loadSalt(),
        iterations: params.iterations,
        parallelism: params.parallelism,
        memorySize: params.memoryKib,
        hashLength: ARGON2_HASH_BYTES,
        outputType: "encoded",
      }),
    };
  }
  return cachedDummyHash.phc;
}

/**
 * Run a password verification against a constant dummy stored hash. The
 * result is always discarded -- the sole purpose of this call is to perform
 * the same amount of hashing work that a real {@link verifyPassword} call
 * would perform under the latest scheme, so that the latency of the login
 * endpoint does not depend on whether the supplied email belongs to a real
 * user. Used by `handleLogin` on the "user not found" branch to close the
 * timing side channel that accompanies email-enumeration.
 */
export async function runDummyPasswordVerification(
  password: string,
): Promise<void> {
  const dummyHash: string = await getDummyPhcHash();
  await argon2Verify({
    password,
    secret: loadSalt(),
    hash: dummyHash,
  });
}
