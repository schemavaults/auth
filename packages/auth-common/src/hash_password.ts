// Web Crypto API
// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest

import maybeStripQuotes from "@/utils/maybeStripQuotes";

// Required environment variables for this module
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PRIVATE_GLOBAL_PASSWORD_SALT: string;
      PRIVATE_PASSWORD_HASH_ROUNDS: string;
    }
  }
}

export async function hashPassword(password: string): Promise<string> {
  if (!process.env.PRIVATE_GLOBAL_PASSWORD_SALT) {
    throw new Error(
      "Missing PRIVATE_GLOBAL_PASSWORD_SALT environment variable",
    );
  } else if (!process.env.PRIVATE_PASSWORD_HASH_ROUNDS) {
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

  const salt: string | undefined = maybeStripQuotes(
    process.env.PRIVATE_GLOBAL_PASSWORD_SALT,
  );
  if (!salt) {
    throw new Error("Failed to load password salt!");
  }

  // String to encode
  const secret: string = `agajnurmomahoeojnaw${password}${salt}`;

  // Text encoder
  const encoder = new TextEncoder();
  const data: Uint8Array = encoder.encode(secret);

  const firstHash: ArrayBuffer = await crypto.subtle.digest("SHA-256", data);

  // Hash Iterations
  let nextHash: ArrayBuffer = firstHash;
  for (let i: number = 0; i < hashRounds; i++) {
    nextHash = await crypto.subtle.digest("SHA-256", nextHash);
  }
  const finalPasswordHash: ArrayBuffer = nextHash;

  // Convert to hex string
  const hashArray: Uint8Array = new Uint8Array(finalPasswordHash);
  const hashHex: string = Array.prototype.map
    .call(hashArray, (x: number) => ("00" + x.toString(16)).slice(-2))
    .join("");

  return hashHex;
}

export async function comparePassword(
  // Password to compare against the saved hash,
  inputPassword: string,
  // Saved password hash
  savedHash: string,
): Promise<boolean> {
  // Salt + Hash the password
  const hashHex: string = await hashPassword(inputPassword);
  // (Password + Salt) => SHA-256 => Hash

  // Does calculated hash match saved hash?
  return hashHex === savedHash;
}
