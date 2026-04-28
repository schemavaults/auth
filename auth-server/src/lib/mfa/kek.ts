import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export const CURRENT_KEK_VERSION = 1;

function readKekFromEnv(envVarName: string): Buffer | null {
  const raw = process.env[envVarName];
  if (typeof raw !== "string" || raw.length === 0) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    throw new Error(
      `Failed to base64-decode ${envVarName}; expected 32-byte base64 string.`,
    );
  }
  if (buf.length !== 32) {
    throw new Error(
      `${envVarName} must be 32 bytes when base64-decoded (got ${buf.length}). Generate with \`openssl rand -base64 32\`.`,
    );
  }
  return buf;
}

let cachedKekVersions: Record<number, Buffer> | null = null;

function loadKekVersions(): Record<number, Buffer> {
  if (cachedKekVersions) return cachedKekVersions;
  const v1 = readKekFromEnv("PRIVATE_MFA_SECRET_KEK");
  if (!v1) {
    throw new Error(
      "PRIVATE_MFA_SECRET_KEK is not set. Generate one with `openssl rand -base64 32` and add it to your environment.",
    );
  }
  const map: Record<number, Buffer> = { 1: v1 };
  // Future: read PRIVATE_MFA_SECRET_KEK_V2, V3, ... here for rotation.
  cachedKekVersions = map;
  return map;
}

function getKek(version: number): Buffer {
  const map = loadKekVersions();
  const key = map[version];
  if (!key) {
    throw new Error(
      `Unknown MFA KEK version ${version}. Configured versions: ${Object.keys(map).join(", ")}.`,
    );
  }
  return key;
}

export interface EncryptSecretResult {
  ciphertext: string; // "v<n>:<iv_b64>:<tag_b64>:<ct_b64>"
  kek_version: number;
}

export function encryptSecret(plaintext: string): EncryptSecretResult {
  const version = CURRENT_KEK_VERSION;
  const key = getKek(version);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  if (tag.length !== AUTH_TAG_BYTES) {
    throw new Error("Unexpected GCM auth tag length");
  }
  const ciphertext = [
    `v${version}`,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
  return { ciphertext, kek_version: version };
}

export function decryptSecret(
  ciphertext: string,
  kek_version: number,
): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid MFA ciphertext format");
  }
  const versionTag = parts[0]!;
  const ivB64 = parts[1]!;
  const tagB64 = parts[2]!;
  const ctB64 = parts[3]!;
  if (versionTag !== `v${kek_version}`) {
    throw new Error(
      `MFA ciphertext version tag (${versionTag}) does not match expected v${kek_version}`,
    );
  }
  const key = getKek(kek_version);
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

// Test-only hook: reset the cached KEK map so env-var changes between
// tests are picked up. Not exported from the library index — only used by
// kek.test.ts.
export function __resetKekCacheForTests(): void {
  cachedKekVersions = null;
}
